// 사다리타기 연출용 계산. 결과(누가 어떤 역할)는 이미 서버가 정해 둔 것이고,
// 여기서는 "출발점에서 아래로 내려가는 길"을 그리는 데만 쓴다.

/** n개 세로줄, rows개 가로 칸의 사다리. rungs[k] = 그 칸에서 오른쪽 줄과 이어지는 왼쪽 줄 번호들 (서로 겹치지 않음) */
export function makeLadder(n, rows, rnd = Math.random) {
  const rungs = [];
  for (let k = 0; k < rows; k++) {
    const row = [];
    for (let c = 0; c < n - 1; c++) {
      if (row.includes(c - 1)) continue; // 바로 왼쪽 줄과 이미 이어졌으면 건너뜀
      if (rnd() < 0.45) row.push(c);
    }
    rungs.push(row);
  }
  return { n, rows, rungs };
}

/** start 줄에서 출발해 내려가는 길. points = [[줄, 칸]...] (칸 -1 = 맨 위, rows = 맨 아래), end = 도착 줄 */
export function walkLadder({ n, rows, rungs }, start) {
  let col = start;
  const points = [[col, -1]];
  for (let k = 0; k < rows; k++) {
    let to = col;
    if (rungs[k].includes(col)) to = col + 1;
    else if (col > 0 && rungs[k].includes(col - 1)) to = col - 1;
    if (to !== col) {
      points.push([col, k], [to, k]);
      col = to;
    }
  }
  points.push([col, rows]);
  return { points, end: col };
}
