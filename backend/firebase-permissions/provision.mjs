// Ejecutar únicamente con credenciales administrativas ADC del proyecto aprobado.
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
const [uid,role]=process.argv.slice(2);
if(!uid||!['central','direction','remove'].includes(role))throw Error('Uso: node provision.mjs UID central|direction|remove');
initializeApp({credential:applicationDefault(),projectId:'gestion-taller-v2'});
const auth=getAuth(),user=await auth.getUser(uid),claims={...(user.customClaims||{})};
if(role==='remove')delete claims.eskalaRole;else{if(!user.emailVerified||user.disabled)throw Error('La cuenta debe estar activa y verificada.');claims.eskalaRole=role;}
await auth.setCustomUserClaims(uid,claims);await auth.revokeRefreshTokens(uid);
console.log('Perfil ESKALA actualizado; debe volver a iniciar sesión.');
