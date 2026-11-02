import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;

const toInt = (value, min, max, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const STREAM_KEY = (env.YT_STREAM_KEY || '').trim();
const RTMP_URL = (env.YT_RTMP_URL || 'rtmp://a.rtmp.youtube.com/live2').replace(/\/+$/, '');
const API_KEY = (env.YT_API_KEY || '').trim();
const HANDLE = (env.CHANNEL_HANDLE || '').replace(/[^A-Za-z0-9@._-]/g, '').slice(0, 30);
const CREDIT = (env.CREDIT_TEXT || 'by @Frankkaumbadev').replace(/[^A-Za-z0-9 @._-]/g, '').slice(0, 40);
const TOP_HANDLES = (
  env.TOP_CHANNELS || '@MrBeast,@tseries,@Cocomelon,@SETIndia,@vladandniki,@KidsDianaShow,@LikeNastya'
)
  .split(',')
  .map((handle) => handle.trim())
  .filter(Boolean)
  .slice(0, 12);
const EFFECTS = (env.EFFECTS || 'on').trim().toLowerCase() !== 'off';
const AUDIO_REQUESTED = (env.AUDIO_FILE || '').trim();
const AUDIO_PATH = resolve(AUDIO_REQUESTED || 'audio/music.mp3');
const HAS_AUDIO = existsSync(AUDIO_PATH);
const PORT = toInt(env.PORT, 1, 65535, 10000);
const WIDTH = Math.round(toInt(env.STREAM_WIDTH, 320, 1920, 640) / 2) * 2;
const HEIGHT = Math.round((WIDTH * 9) / 16 / 2) * 2;
const FPS = toInt(env.STREAM_FPS, 5, 30, 10);
const VIDEO_KBPS = toInt(env.VIDEO_KBPS, 150, 6000, 450);
const SCALE = WIDTH / 1280;

const BASE_POPULATION = Number(env.BASE_POPULATION) || 8290000000;
const BASE_TIME = Date.parse(env.BASE_POPULATION_DATE || '') || Date.parse('2026-07-01T00:00:00Z');

const RATES = {
  births: 4.2,
  deaths: 2.02,
  searches: 158000,
  emails: 4200000,
  videoHours: 11600,
  co2: 1170
};

const WORK_DIR = join(tmpdir(), 'yt-live-counter');
const BACKGROUND = join(WORK_DIR, 'background.png');
const SANS = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf';
const FA_SOLID = fileURLToPath(new URL('./fonts/fa-solid-900.ttf', import.meta.url));
const FA_BRANDS = fileURLToPath(new URL('./fonts/fa-brands-400.ttf', import.meta.url));

const ICON = {
  globe: 0xf57c,
  baby: 0xf77c,
  dove: 0xf4ba,
  search: 0xf002,
  mail: 0xf0e0,
  youtube: 0xf167,
  smog: 0xf75f,
  crown: 0xf521,
  medal: 0xf5a2,
  star: 0xf005,
  bullhorn: 0xf0a1,
  code: 0xf121,
  bell: 0xf0f3,
  hourglass: 0xf252,
  dot: 0xf111,
  satellite: 0xf7bf,
  pulse: 0xf21e
};

const COLUMNS = [30, 443, 856];
const ROWS = [242, 350];
const TILE_W = 393;
const TILE_H = 98;
const BOARD_Y = 488;
const BOARD_SIZE = 5;
const BOARD_W = 236;
const BOARD_GAP = 10;
const DAY_SLOTS = 16;
const POLL_MS = 300000;
const MUTED = '0xb9c6dd';
const WHITE = '0xffffff';
const RANK_COLORS = ['0xfcd34d', '0xcbd5e1', '0xff9f68', '0x7cc4ff', '0xc4a7ff'];
const RANK_ICONS = [ICON.crown, ICON.medal, ICON.medal, ICON.star, ICON.star];

const TILES = [
  { id: 'births', title: 'Babies born today', color: '0xff8fab', icon: ICON.baby },
  { id: 'deaths', title: 'Deaths today', color: '0xc4a7ff', icon: ICON.dove },
  { id: 'searches', title: 'Google searches today', color: '0x7cc4ff', icon: ICON.search },
  { id: 'emails', title: 'Emails sent today', color: '0xfcd34d', icon: ICON.mail },
  { id: 'videoHours', title: 'YouTube hours today', color: '0xff7a59', icon: ICON.youtube, brands: true },
  { id: 'co2', title: 'CO2 tonnes today', color: '0x5eead4', icon: ICON.smog }
];

const px = (value) => Math.round(value * SCALE);
const xpos = (x) => (typeof x === 'number' ? px(x) : x);
const tileAt = (index) => ({ x: COLUMNS[index % 3], y: ROWS[Math.floor(index / 3)] });
const boardX = (index) => 30 + index * (BOARD_W + BOARD_GAP);
const fmt = (value) => Math.floor(value).toLocaleString('en-US');
const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

const compact = (value) => {
  if (value >= 1e9) return `${(value / 1e9).toPrecision(3)}B`;
  if (value >= 1e6) return `${(value / 1e6).toPrecision(3)}M`;
  if (value >= 1e3) return `${(value / 1e3).toPrecision(3)}K`;
  return String(value);
};

const shortName = (title) =>
  String(title || '')
    .split(/\s[-–|]\s/)[0]
    .trim()
    .slice(0, 13);

const box = (x, y, w, h, color) =>
  `drawbox=x=${px(x)}:y=${px(y)}:w=${px(w)}:h=${px(h)}:color=${color}:t=fill`;

const label = (text, x, y, size, color, font = SANS) =>
  `drawtext=fontfile=${font}:text='${text}':expansion=none:fontsize=${px(size)}:fontcolor=${color}:x='${xpos(x)}':y='${xpos(y)}'`;

const live = (name, x, y, size, color, font = MONO) =>
  `drawtext=fontfile=${font}:textfile='${join(WORK_DIR, `${name}.txt`)}':reload=1:expansion=none:fontsize=${px(size)}:fontcolor=${color}:x='${xpos(x)}':y='${xpos(y)}'`;

const glyph = (code, x, y, size, color, { brands = false, enable = '' } = {}) =>
  `drawtext=fontfile=${brands ? FA_BRANDS : FA_SOLID}:text='${String.fromCodePoint(code)}':expansion=none:fontsize=${px(size)}:fontcolor=${color}:x='${xpos(x)}':y='${xpos(y)}'${enable ? `:enable='${enable}'` : ''}`;

const centeredGlyph = (code, cx, cy, size, color, options) =>
  glyph(code, `${px(cx)}-text_w/2`, `${px(cy)}-text_h/2`, size, color, options);

const orbitingGlyph = (code, cx, cy, radius, period, phase, size, color) =>
  glyph(
    code,
    `${px(cx)}-text_w/2+${px(radius)}*cos(2*PI*t/${period}+${phase})`,
    `${px(cy)}-text_h/2+${px(radius)}*sin(2*PI*t/${period}+${phase})`,
    size,
    color
  );

const board = [];
const channelIds = new Map();
const unresolved = new Set();
const state = { startedAt: Date.now(), restarts: 0, streaming: false };

const writeText = (name, value) => {
  const target = join(WORK_DIR, `${name}.txt`);
  const staging = `${target}.tmp`;
  writeFileSync(staging, value);
  renameSync(staging, target);
};

const redact = (text) => (STREAM_KEY ? String(text).split(STREAM_KEY).join('***') : String(text));

const tickerLines = (snapshot) => {
  const lines = [
    'Counters reset every day at 00:00 UTC. Stay for the reset',
    `The world grew by ${fmt(snapshot.growthToday)} people since midnight UTC`,
    'About 4 babies are born around the world every second',
    'Drop a comment: where in the world are you watching from?',
    `${fmt(RATES.emails * 60)} emails are sent every minute`,
    `Humans release about ${fmt(RATES.co2 * 60)} tonnes of CO2 each minute`,
    'All numbers are live estimates from global yearly averages',
    'Like the stream and stay to watch the numbers climb'
  ];
  if (board.length > 1) {
    lines.unshift(
      `${board[0].name} leads ${board[1].name} by ${compact(board[0].subs - board[1].subs)} subscribers`
    );
  }
  if (HANDLE) lines.unshift(`Subscribe to ${HANDLE} for more live counters`);
  return lines;
};

const snapshotAt = (now) => {
  const date = new Date(now);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const today = (now - midnight) / 1000;
  const net = RATES.births - RATES.deaths;
  return {
    clock: `${date.toISOString().slice(11, 19)} UTC`,
    today,
    population: BASE_POPULATION + net * ((now - BASE_TIME) / 1000),
    growthToday: net * today
  };
};

const tick = () => {
  const now = Date.now();
  const snapshot = snapshotAt(now);
  writeText('population', fmt(snapshot.population));
  writeText('clock', snapshot.clock);

  const dayRatio = clampNumber(snapshot.today / 86400, 0, 1);
  const filled = Math.round(dayRatio * DAY_SLOTS);
  writeText(
    'dayBar',
    `Day ${'█'.repeat(filled)}${'▁'.repeat(DAY_SLOTS - filled)} ${Math.floor(dayRatio * 100)}%`
  );

  for (const id of Object.keys(RATES)) writeText(id, fmt(RATES[id] * snapshot.today));

  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const entry = board[index];
    writeText(`rankName${index}`, entry ? `#${index + 1} ${entry.name}` : `#${index + 1}`);
    writeText(`rankSubs${index}`, entry ? compact(entry.subs) : '--');
  }

  const lines = tickerLines(snapshot);
  writeText('ticker', lines[Math.floor(now / 9000) % lines.length]);
};

const apiGet = async (path, params) => {
  const query = new URLSearchParams({ ...params, key: API_KEY });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${query}`, {
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const pollBoard = async () => {
  try {
    for (const handle of TOP_HANDLES) {
      if (channelIds.has(handle) || unresolved.has(handle)) continue;
      const body = await apiGet('channels', { part: 'id', forHandle: handle });
      const id = body.items?.[0]?.id;
      if (id) {
        channelIds.set(handle, id);
      } else {
        unresolved.add(handle);
        console.error(`Channel not found for ${handle}`);
      }
    }
    if (channelIds.size === 0) return;
    const body = await apiGet('channels', {
      part: 'snippet,statistics',
      id: [...channelIds.values()].join(','),
      maxResults: '50'
    });
    const ranked = (body.items || [])
      .filter((item) => !item.statistics?.hiddenSubscriberCount)
      .map((item) => ({
        name: shortName(item.snippet?.title),
        subs: Number(item.statistics?.subscriberCount)
      }))
      .filter((entry) => Number.isFinite(entry.subs))
      .sort((a, b) => b.subs - a.subs);
    if (ranked.length) board.splice(0, board.length, ...ranked);
  } catch (error) {
    console.error(`YouTube API poll failed: ${redact(error.message)}`);
  }
};

const backgroundFilter = () => {
  const parts = [
    'format=gbrp',
    "geq=r='6+30*Y/H':g='24-8*Y/H':b='43+20*Y/H'",
    box(0, 0, 1280, 66, '0x000000@0.35'),
    box(30, 14, 120, 40, '0xe11d48'),
    label('LIVE', 74, 18, 28, WHITE),
    label('World Live Counter', 168, 14, 36, WHITE),
    glyph(ICON.hourglass, 626, 21, 24, '0x7cc4ff'),
    box(30, 78, 1220, 150, '0xffffff@0.09'),
    box(30, 78, 1220, 6, '0x7cc4ff'),
    label('World population', '(w-text_w)/2', 90, 28, MUTED),
    centeredGlyph(ICON.globe, 112, 156, 76, '0x7cc4ff')
  ];

  TILES.forEach((tile, index) => {
    const { x, y } = tileAt(index);
    parts.push(box(x, y, TILE_W, TILE_H, '0xffffff@0.07'));
    parts.push(box(x, y, 6, TILE_H, tile.color));
    parts.push(glyph(tile.icon, x + 22, y + 11, 24, tile.color, { brands: tile.brands }));
    parts.push(label(tile.title, x + 58, y + 12, 22, MUTED));
  });

  parts.push(glyph(ICON.youtube, 30, 457, 26, '0xff4d4d', { brands: true }));
  parts.push(label('Biggest YouTube channels by subscribers', 66, 458, 22, MUTED));

  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const x = boardX(index);
    parts.push(box(x, BOARD_Y, BOARD_W, TILE_H, '0xffffff@0.07'));
    parts.push(box(x, BOARD_Y, 6, TILE_H, RANK_COLORS[index]));
    parts.push(glyph(RANK_ICONS[index], x + BOARD_W - 62, BOARD_Y + 46, 38, RANK_COLORS[index]));
  }

  parts.push(box(30, 598, 1220, 48, '0x000000@0.3'));
  parts.push(glyph(ICON.bullhorn, 50, 609, 26, '0xfcd34d'));

  parts.push(box(30, 660, 1220, 46, '0xffffff@0.06'));
  parts.push(box(30, 660, 1220, 3, '0x5eead4'));
  parts.push(glyph(ICON.code, 48, 670, 26, '0x5eead4'));
  parts.push(label(CREDIT, 90, 669, 26, WHITE));
  parts.push(label('Subscribe and turn on the bell', `${px(1190)}-text_w`, 671, 24, MUTED));
  parts.push(glyph(ICON.bell, 1202, 669, 26, '0xfcd34d'));

  parts.push('format=rgb24');
  return parts.join(',');
};

const liveFilter = () => {
  const parts = [
    'format=yuv420p',
    live('dayBar', 662, 22, 22, '0x7cc4ff'),
    live('clock', `${px(1250)}-text_w`, 18, 30, MUTED),
    live('population', '(w-text_w)/2', 120, 88, WHITE)
  ];

  if (EFFECTS) {
    parts.push(
      glyph(ICON.dot, 46, 25, 20, WHITE, { enable: 'lt(mod(t,1.2),0.7)' }),
      orbitingGlyph(ICON.satellite, 112, 156, 58, 6, 0, 26, '0xfcd34d'),
      orbitingGlyph(ICON.dot, 112, 156, 58, 6, Math.PI.toFixed(4), 12, '0x5eead4'),
      centeredGlyph(ICON.pulse, 1168, 156, 80, '0xff8fab', { enable: 'lt(mod(t,1),0.35)' }),
      centeredGlyph(ICON.pulse, 1168, 156, 64, '0xff8fab', { enable: 'gte(mod(t,1),0.35)' })
    );
  }

  TILES.forEach((tile, index) => {
    const { x, y } = tileAt(index);
    parts.push(live(tile.id, x + 22, y + 44, 40, tile.color));
  });

  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const x = boardX(index);
    parts.push(live(`rankName${index}`, x + 22, BOARD_Y + 10, 22, MUTED, SANS));
    parts.push(live(`rankSubs${index}`, x + 22, BOARD_Y + 42, 46, RANK_COLORS[index]));
  }

  parts.push(live('ticker', '(w-text_w)/2', 607, 26, '0xf1f5f9', SANS));
  return parts.join(',');
};

const buildBackground = () => {
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=black:s=${WIDTH}x${HEIGHT}`,
      '-vf',
      backgroundFilter(),
      '-frames:v',
      '1',
      BACKGROUND
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`background render failed: ${result.stderr || result.error?.message}`);
  }
};

const streamArgs = () => {
  const audioInput = HAS_AUDIO
    ? ['-re', '-stream_loop', '-1', '-i', AUDIO_PATH]
    : ['-re', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];

  return [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-re',
    '-loop',
    '1',
    '-framerate',
    String(FPS),
    '-i',
    BACKGROUND,
    ...audioInput,
    '-filter_threads',
    '1',
    '-vf',
    liveFilter(),
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-profile:v',
    'main',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(FPS),
    '-b:v',
    `${VIDEO_KBPS}k`,
    '-maxrate',
    `${VIDEO_KBPS}k`,
    '-bufsize',
    `${VIDEO_KBPS * 2}k`,
    '-g',
    String(FPS * 2),
    '-keyint_min',
    String(FPS * 2),
    '-sc_threshold',
    '0',
    '-threads',
    '1',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-flvflags',
    'no_duration_filesize',
    '-f',
    'flv',
    `${RTMP_URL}/${STREAM_KEY}`
  ];
};

let child = null;
let stopping = false;
let retryDelay = 3000;

const startStream = () => {
  if (stopping) return;
  const launchedAt = Date.now();
  let stderrTail = '';
  let settled = false;

  child = spawn('ffmpeg', streamArgs(), { stdio: ['ignore', 'ignore', 'pipe'] });
  state.streaming = true;
  console.log('Stream process started');

  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk).slice(-800);
  });

  const onEnd = (reason) => {
    if (settled) return;
    settled = true;
    child = null;
    state.streaming = false;
    if (stopping) return;
    state.restarts += 1;
    retryDelay = Date.now() - launchedAt > 60000 ? 3000 : Math.min(retryDelay * 2, 30000);
    console.error(`Stream process ended (${reason}). Restarting in ${retryDelay / 1000}s`);
    if (stderrTail) console.error(redact(stderrTail));
    setTimeout(startStream, retryDelay);
  };

  child.on('error', (error) => onEnd(error.message));
  child.on('close', (code, signal) => onEnd(`code ${code}, signal ${signal}`));
};

const shutdown = () => {
  stopping = true;
  if (child) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1500).unref();
};

if (!STREAM_KEY || !API_KEY) {
  console.error('YT_STREAM_KEY and YT_API_KEY are required');
  process.exit(1);
}

for (const font of [SANS, MONO, FA_SOLID, FA_BRANDS]) {
  if (!existsSync(font)) {
    console.error(`Missing font file: ${font}`);
    process.exit(1);
  }
}

if (HAS_AUDIO) console.log(`Audio: ${AUDIO_PATH}`);
else if (AUDIO_REQUESTED) console.error(`AUDIO_FILE not found: ${AUDIO_PATH}. Streaming silence`);
else console.log('No audio/music.mp3 found. Streaming silence');

mkdirSync(WORK_DIR, { recursive: true });

await pollBoard();
tick();
buildBackground();

setInterval(tick, 500);
setInterval(pollBoard, POLL_MS);

createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      streaming: state.streaming,
      restarts: state.restarts,
      uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000),
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      audio: HAS_AUDIO,
      effects: EFFECTS,
      leaderboard: board.slice(0, BOARD_SIZE)
    })
  );
}).listen(PORT, '0.0.0.0', () => console.log(`Listening on ${PORT}`));

if (env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    fetch(`${env.RENDER_EXTERNAL_URL}/health`, { signal: AbortSignal.timeout(10000) }).catch(() => {});
  }, 4 * 60 * 1000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startStream();
