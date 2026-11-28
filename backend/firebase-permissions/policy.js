export const MAX_HOURS=720;
export const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
export const validSecret=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
export function state(row,now){if(!row)return 'expired';if(row.status==='revoked')return 'revoked';if(row.status!=='active'||!Number.isFinite(row.expiresAtMs)||row.expiresAtMs<=now)return 'expired';return 'active'}
export function canShare(actor,grant){return actor?.role==='central'||(actor?.role==='direction'&&grant?.status==='active')}
export function canManage(actor,row){return actor?.role==='central'||(actor?.role==='direction'&&row?.origin==='direction'&&row?.createdBy===actor.uid)}
export function ttl(value){if(typeof value!=='number'||!Number.isFinite(value)||value<1||value>MAX_HOURS)throw Error('Duración entre 1 y 720 horas');return Math.round(value*3600000)}
export function visibleToDirection(grant){return grant?.status==='active'}
export function accessView(row,now){const {tokenHash,...safe}=row;return {...safe,effectiveStatus:state(row,now),createdAt:new Date(row.createdAtMs).toISOString(),expiresAt:new Date(row.expiresAtMs).toISOString(),remainingMs:Math.max(0,row.expiresAtMs-now)}}
