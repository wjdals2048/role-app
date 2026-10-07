// Vercel 서버 함수: 배정 실행과 다시 열기. 선호 데이터는 여기서만 읽는다(브라우저는 남의 선호를 읽을 수 없다).
import { randomInt } from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { runAssignment } from '../lib/roomService.js';

function admin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw Object.assign(new Error('서버에 FIREBASE_SERVICE_ACCOUNT 환경 변수가 없어요.'), { status: 500 });
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return { auth: getAuth(), db: getFirestore() };
}

const fail = (status, message) => Object.assign(new Error(message), { status });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요.' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) throw fail(401, '로그인 정보가 없어요.');
    const { auth, db } = admin();
    const decoded = await auth.verifyIdToken(token).catch(() => {
      throw fail(401, '로그인 정보가 올바르지 않아요.');
    });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const code = String(body.code || '').toUpperCase();
    const action = body.action;
    if (!/^[A-Z2-9]{6}$/.test(code)) throw fail(400, '방 코드 형식이 올바르지 않아요.');
    if (action !== 'assign' && action !== 'reopen') throw fail(400, '알 수 없는 요청이에요.');

    const roomRef = db.doc(`rooms/${code}`);
    const snap = await roomRef.get();
    if (!snap.exists) throw fail(404, '방을 찾을 수 없어요.');
    const room = snap.data();
    if (room.creatorUid !== decoded.uid) throw fail(403, '방장만 할 수 있어요.');

    if (action === 'reopen') {
      const batch = db.batch();
      batch.delete(roomRef.collection('results').doc('public'));
      const privs = await roomRef.collection('results_private').get();
      privs.docs.forEach((d) => batch.delete(d.ref));
      batch.update(roomRef, { status: 'collecting' });
      await batch.commit();
      return res.status(200).json({ ok: true });
    }

    if (room.status !== 'collecting') throw fail(409, '이미 배정된 방이에요. 다시 배정하려면 "선호 수정하기"를 먼저 눌러 주세요.');
    const [memSnap, prefSnap] = await Promise.all([roomRef.collection('members').get(), roomRef.collection('prefs').get()]);
    const members = memSnap.docs.map((d) => ({ uid: d.id, nickname: d.data().nickname }));
    if (members.length < 1) throw fail(400, '참여자가 없어요.');
    const prefsByUid = {};
    prefSnap.docs.forEach((d) => (prefsByUid[d.id] = d.data()));

    const seed = randomInt(1, 2 ** 31 - 1);
    const round = (room.round || 0) + 1;
    const { publicResult, privateByUid } = await runAssignment({
      room,
      members,
      prefsByUid,
      seed,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const batch = db.batch();
    batch.set(roomRef.collection('results').doc('public'), { ...publicResult, round, createdAt: FieldValue.serverTimestamp() });
    for (const [uid, v] of Object.entries(privateByUid)) batch.set(roomRef.collection('results_private').doc(uid), v);
    batch.update(roomRef, { status: 'assigned', round });
    await batch.commit();
    return res.status(200).json({ ok: true, aiUsed: publicResult.aiUsed });
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    return res.status(status).json({ error: status === 500 ? e.message || '서버 오류가 났어요.' : e.message });
  }
}
