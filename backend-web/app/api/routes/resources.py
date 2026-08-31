"""私有资源上传、订单链接签发和受限下载。"""
from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.services.card_service import CardService
from common.models.card import Card
from common.models.resource_download_ticket import ResourceDownloadTicket
from common.models.resource_file import ResourceFile
from common.models.user import User

router = APIRouter(prefix="/resources", tags=["资源管理"])
RESOURCE_DIR = Path(os.getenv("RESOURCE_STORAGE_DIR", "/app/static/uploads/resources"))
PUBLIC_BASE = os.getenv("RESOURCE_PUBLIC_BASE", "https://freefish.duckdns.org").rstrip("/")
INTERNAL_BASE = os.getenv("RESOURCE_INTERNAL_BASE", "http://backend-web:8089/api/v1").rstrip("/")
MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024


def _resource_dict(row: ResourceFile, card: Card | None = None) -> dict:
    item_id = row.item_id or (card.item_id if card else None)
    card_id = row.card_id or (card.id if card else None)
    ttl_hours = row.ttl_hours
    if ttl_hours is None and card and card.api_config:
        try:
            config = json.loads(card.api_config) if isinstance(card.api_config, str) else card.api_config
            params = config.get("params", {}) if isinstance(config, dict) else {}
            params = json.loads(params) if isinstance(params, str) else params
            ttl_hours = int(params.get("ttl_hours")) if params.get("ttl_hours") is not None else None
        except (TypeError, ValueError, json.JSONDecodeError):
            ttl_hours = None
    return {
        "id": row.id, "name": row.name, "size_bytes": row.size_bytes,
        "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        "max_downloads": row.max_downloads, "download_count": row.download_count,
        "item_id": item_id, "card_id": card_id, "ttl_hours": ttl_hours,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("")
async def list_resources(current_user: User = Depends(deps.get_current_active_user), session: AsyncSession = Depends(deps.get_db_session)):
    result = await session.execute(select(ResourceFile).where(ResourceFile.user_id == current_user.id).order_by(ResourceFile.id.desc()))
    resources = result.scalars().all()
    cards = (await session.execute(select(Card).where(Card.user_id == current_user.id))).scalars().all()
    rows = []
    for row in resources:
        card = next((candidate for candidate in cards if candidate.id == row.card_id or (row.token and row.token in (candidate.api_config or ""))), None)
        rows.append(_resource_dict(row, card))
    return rows


@router.post("")
async def upload_resource(
    file: UploadFile = File(...),
    item_id: str = Form(""),
    ttl_hours: int = Form(168),
    max_downloads: int = Form(3),
    current_user: User = Depends(deps.get_current_active_user),
    session: AsyncSession = Depends(deps.get_db_session),
):
    if ttl_hours < 1 or ttl_hours > 24 * 365:
        raise HTTPException(400, "有效期必须在1小时到365天之间")
    if max_downloads < 1 or max_downloads > 1000:
        raise HTTPException(400, "下载次数必须在1到1000之间")
    RESOURCE_DIR.mkdir(parents=True, exist_ok=True)
    original_name = Path(file.filename or "resource.bin").name
    storage_name = secrets.token_hex(24)
    target = RESOURCE_DIR / storage_name
    size = 0
    try:
        with target.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise HTTPException(413, "文件不能超过5GB")
                output.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise

    master_token = secrets.token_urlsafe(36)
    resource = ResourceFile(
        user_id=current_user.id, name=original_name, token=master_token,
        storage_path=str(target), size_bytes=size,
        expires_at=None, max_downloads=max_downloads, download_count=0,
        item_id=item_id.strip() or None, ttl_hours=ttl_hours,
    )
    session.add(resource)
    await session.flush()

    card_id = None
    if item_id.strip():
        api_config = {
            "url": f"{INTERNAL_BASE}/resources/issue/{master_token}",
            "method": "POST", "timeout": 10,
            "headers": "{}",
            "params": json.dumps({"order_id": "{order_id}", "ttl_hours": ttl_hours}),
            "response_field": "data",
        }
        card_id = await CardService(session).create_card(
            user_id=current_user.id, item_id=item_id.strip(),
            name=f"资源-{original_name}", card_type="api", api_config=api_config,
            text_content=None, data_content=None, image_url=None, image_urls=None,
            description="下载链接将在订单完成后生成，请在有效期内下载。",
            enabled=True, delay_seconds=0, use_no_logistics_form=False,
            price=None, is_dockable=False, fee_payer=None, min_price=None,
            dock_visibility=None, is_multi_spec=False, spec_name=None, spec_value=None,
        )
        resource.card_id = card_id
    await session.commit()
    await session.refresh(resource)
    return {"success": True, "resource": _resource_dict(resource), "card_id": card_id}


@router.post("/issue/{master_token}")
async def issue_link(master_token: str, payload: dict, session: AsyncSession = Depends(deps.get_db_session)):
    result = await session.execute(select(ResourceFile).where(ResourceFile.token == master_token))
    resource = result.scalar_one_or_none()
    if not resource or not Path(resource.storage_path).is_file():
        raise HTTPException(404, "资源不存在")
    order_id = str(payload.get("order_id") or "").strip()
    if not order_id:
        raise HTTPException(400, "缺少订单号")
    ttl_hours = max(1, min(int(payload.get("ttl_hours") or 168), 24 * 365))
    existing_result = await session.execute(select(ResourceDownloadTicket).where(ResourceDownloadTicket.resource_id == resource.id, ResourceDownloadTicket.order_id == order_id))
    ticket = existing_result.scalar_one_or_none()
    now = datetime.now()
    if not ticket or ticket.expires_at <= now or ticket.download_count >= ticket.max_downloads:
        if ticket:
            await session.delete(ticket)
            await session.flush()
        ticket = ResourceDownloadTicket(
            resource_id=resource.id, order_id=order_id,
            token=secrets.token_urlsafe(36), expires_at=now + timedelta(hours=ttl_hours),
            max_downloads=resource.max_downloads or 3, download_count=0,
        )
        session.add(ticket)
    await session.commit()
    url = f"{PUBLIC_BASE}/r/{ticket.token}/{resource.name}"
    return {"success": True, "data": url, "expires_at": ticket.expires_at.isoformat(), "max_downloads": ticket.max_downloads}


@router.get("/download/{ticket_token}/{display_name}")
async def download_resource(ticket_token: str, display_name: str, session: AsyncSession = Depends(deps.get_db_session)):
    result = await session.execute(select(ResourceDownloadTicket).where(ResourceDownloadTicket.token == ticket_token).with_for_update())
    ticket = result.scalar_one_or_none()
    if not ticket or ticket.expires_at <= datetime.now():
        raise HTTPException(410, "下载链接已过期")
    if ticket.download_count >= ticket.max_downloads:
        raise HTTPException(410, "下载次数已用完")
    resource_result = await session.execute(select(ResourceFile).where(ResourceFile.id == ticket.resource_id))
    resource = resource_result.scalar_one_or_none()
    if not resource or not Path(resource.storage_path).is_file():
        raise HTTPException(404, "资源文件不存在")
    ticket.download_count += 1
    resource.download_count += 1
    await session.commit()
    return FileResponse(resource.storage_path, filename=resource.name, media_type="application/octet-stream")


@router.delete("/{resource_id}")
async def delete_resource(resource_id: int, current_user: User = Depends(deps.get_current_active_user), session: AsyncSession = Depends(deps.get_db_session)):
    result = await session.execute(select(ResourceFile).where(ResourceFile.id == resource_id, ResourceFile.user_id == current_user.id))
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(404, "资源不存在")
    Path(resource.storage_path).unlink(missing_ok=True)
    await session.delete(resource)
    await session.commit()
    return {"success": True}
