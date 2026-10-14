// 프로필 캐릭터: 마타(M)·타바(T)의 표정 6가지씩, 모두 12개. 닉네임처럼 방 안에서는 공개 정보이고 선호와는 무관하다.
export const AVATAR_IDS = ['M_base', 'M_wink', 'M_happy', 'M_think', 'M_wow', 'M_sleep', 'T_base', 'T_wink', 'T_happy', 'T_think', 'T_wow', 'T_sleep'];
export const AVATAR_BG = { M: '#FFFFFF', T: '#FFFFFF' }; // 두 캐릭터 모두 흰 배경
export const AVATAR_LABEL = { base: '기본', wink: '윙크', happy: '신남', think: '고민', wow: '놀람', sleep: '숙면' };
export const validAvatar = (id) => AVATAR_IDS.includes(id);
/** 고르지 않았거나 예전 참여자(avatar 없음)일 때는 uid로 마타·타바 기본 표정 중 하나를 정한다(항상 같은 값). */
export function defaultAvatar(seed = '') {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 2 ? 'T_base' : 'M_base';
}
