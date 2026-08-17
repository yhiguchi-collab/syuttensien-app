// JMAP（日本医師会 地域医療情報システム、https://jmap.jp/）の施設別検索から
// 在宅療養支援診療所・病院（機能強化型＋従来型、計6区分）を47都道府県分取得し、
// home-visit-clinic-data.js を作り直す。
//
// 使い方: node scripts/update-home-visit-clinic.js
//
// JMAPは住所は取得できるが緯度経度が無いため、Nominatim（住所検索サービス）で
// 位置情報を調べる。ただし全件を毎回調べ直すと時間がかかり、Nominatimにも
// 負荷をかけすぎるため、前回までに調べた「名前」が一致する施設は
// 位置情報を使い回し、新しく見つかった施設だけ新たに調べる。
//
// サーバーに配慮し、検索の間・住所検索の間はそれぞれ間隔をあけて実行するため、
// 全件実行には数十分〜数時間かかる。

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUTPUT_FILE = path.join(__dirname, "..", "home-visit-clinic-data.js");
const VAR_NAME = "HOME_VISIT_CLINIC_DATA";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_DELAY_MS = 1100; // Nominatimの利用ポリシー（1秒に1回まで）を守る
const JMAP_DELAY_MS = 1500; // JMAPサーバーへの配慮

const ALL_PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

// テスト時は環境変数で対象県を絞れるようにする（例: JMAP_TEST_PREFECTURES=福岡県,佐賀県）
const PREFECTURES = process.env.JMAP_TEST_PREFECTURES
  ? process.env.JMAP_TEST_PREFECTURES.split(",")
  : ALL_PREFECTURES;

// 都道府県ごとのおおよその範囲 [南端緯度, 北端緯度, 西端経度, 東端経度]。
// 同名の医療機関が別の都道府県にもある場合の誤登録（住所の使い回し・
// ジオコーディング結果の取り違え）を防ぐための、大まかなチェック用。
const PREFECTURE_BOUNDS = {
  "北海道": [41.152, 45.712, 139.067, 145.916],
  "青森県": [40.218, 41.606, 139.234, 141.904],
  "岩手県": [38.748, 40.560, 140.653, 142.332],
  "宮城県": [37.773, 39.003, 140.275, 142.051],
  "秋田県": [38.873, 40.511, 139.343, 140.995],
  "山形県": [37.734, 39.593, 139.138, 140.646],
  "福島県": [36.744, 37.989, 139.165, 141.438],
  "茨城県": [35.739, 36.945, 139.688, 141.031],
  "栃木県": [36.200, 37.155, 139.327, 140.292],
  "群馬県": [35.985, 37.059, 138.397, 139.670],
  "埼玉県": [35.754, 36.283, 138.711, 139.900],
  "千葉県": [34.617, 36.104, 139.518, 141.125],
  "東京都": [24.0, 35.899, 135.854, 154.206], // 小笠原諸島を含むため南端は緩め
  "神奈川県": [34.957, 35.673, 138.916, 139.858],
  "新潟県": [36.737, 38.897, 137.532, 139.900],
  "富山県": [36.274, 37.253, 136.768, 137.763],
  "石川県": [36.067, 38.135, 136.082, 137.865],
  "福井県": [35.344, 36.451, 135.449, 136.832],
  "山梨県": [35.168, 35.972, 138.180, 139.134],
  "長野県": [35.198, 37.030, 137.325, 138.739],
  "岐阜県": [35.134, 36.465, 136.276, 137.653],
  "静岡県": [34.372, 35.646, 137.474, 139.421],
  "愛知県": [34.276, 35.425, 136.671, 137.838],
  "三重県": [33.613, 35.258, 135.853, 137.326],
  "滋賀県": [34.791, 35.704, 135.764, 136.455],
  "京都府": [34.706, 36.150, 134.851, 136.055],
  "大阪府": [34.272, 35.051, 135.026, 135.747],
  "兵庫県": [34.012, 35.875, 134.253, 135.469],
  "奈良県": [33.859, 34.781, 135.540, 136.230],
  "和歌山県": [33.233, 34.394, 134.880, 136.322],
  "鳥取県": [35.058, 35.803, 133.136, 134.515],
  "島根県": [34.302, 36.556, 131.462, 133.638],
  "岡山県": [34.252, 35.353, 133.267, 134.413],
  "広島県": [34.008, 35.106, 132.036, 133.497],
  "山口県": [33.553, 35.078, 130.398, 132.511],
  "徳島県": [33.331, 34.366, 133.661, 134.987],
  "香川県": [34.012, 34.629, 133.357, 134.596],
  "愛媛県": [32.786, 34.320, 131.880, 133.693],
  "高知県": [32.384, 33.883, 132.213, 134.542],
  "福岡県": [32.940, 34.647, 129.813, 131.249],
  "佐賀県": [32.918, 33.705, 129.640, 130.542],
  "長崎県": [31.785, 34.892, 127.869, 130.482],
  "熊本県": [32.009, 33.195, 129.322, 131.330],
  "大分県": [32.379, 33.846, 130.825, 132.276],
  "宮崎県": [31.252, 32.839, 130.703, 132.206],
  "鹿児島県": [26.839, 32.329, 128.205, 131.316],
  "沖縄県": [23.846, 28.086, 122.714, 131.554],
};

function isWithinPrefecture(lat, lon, prefecture) {
  const bounds = PREFECTURE_BOUNDS[prefecture];
  if (!bounds) return true; // 未登録の場合はチェックをスキップ
  const [south, north, west, east] = bounds;
  return lat >= south && lat <= north && lon >= west && lon <= east;
}

const CATEGORIES = [
  { label: "在宅療養支援診療所1：単独型機能強化型", type: "診療所（単独型機能強化型）" },
  { label: "在宅療養支援診療所2：連携型機能強化型", type: "診療所（連携型機能強化型）" },
  { label: "在宅療養支援診療所3：従来型", type: "診療所（従来型）" },
  { label: "在宅療養支援病院1：単独型機能強化型", type: "病院（単独型機能強化型）" },
  { label: "在宅療養支援病院2：連携型機能強化型", type: "病院（連携型機能強化型）" },
  { label: "在宅療養支援病院3：従来型", type: "病院（従来型）" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJmapFacilitiesOnce(page, prefecture, category) {
  await page.goto("https://jmap.jp/facilities/search", { waitUntil: "load" });
  await page.click(`text=${prefecture}`);
  await page.click(`text=${category.label}`);
  await page.click('input[type="image"]');
  await page.waitForSelector("text=対象施設数", { timeout: 30000 });

  const bodyText = await page.textContent("body");
  const countMatch = bodyText.match(/対象施設数：\s*(\d+)件/);
  const count = countMatch ? parseInt(countMatch[1], 10) : 0;
  if (count === 0) {
    return [];
  }

  // 表示件数を最大(1000件)にする。100件を超える場合のみ切り替えが必要。
  if (count > 100) {
    await page.selectOption("#limit", "1000");
    await page.waitForSelector("#dataList", { timeout: 30000 });
    await sleep(300); // 表の再描画が落ち着くのを少し待つ
  }

  const rows = await page.$$eval("#dataList tr", (trs) =>
    trs
      .slice(1) // 先頭行は見出し
      .map((tr) => {
        const tds = tr.querySelectorAll("td");
        if (tds.length < 3) return null;
        const facilityType = tds[0].textContent.trim();
        const nameLink = tds[1].querySelector("a");
        const name = (nameLink ? nameLink.textContent : tds[1].textContent).trim();
        const address = tds[2].textContent.trim();
        return { facilityType, name, address };
      })
      .filter(Boolean)
  );

  if (rows.length !== count && rows.length < Math.min(count, 1000)) {
    throw new Error(`件数が一致しません（想定${count}件、取得${rows.length}件）`);
  }

  return rows.map((r) => ({ ...r, prefecture, category: category.type }));
}

// JMAPのページ遷移タイミングのズレで稀に失敗するため、1回だけ再試行する
async function fetchJmapFacilities(page, prefecture, category) {
  try {
    return await fetchJmapFacilitiesOnce(page, prefecture, category);
  } catch (err) {
    console.log(`  再試行します（${prefecture} / ${category.type}）: ${err.message}`);
    await sleep(2000);
    return await fetchJmapFacilitiesOnce(page, prefecture, category);
  }
}

// 数時間かかる処理のため、通信の一時的な失敗（タイムアウト・接続断など）で
// 全体が止まらないよう、最大3回まで自動で再試行する。
async function geocodeOnce(address, attempt) {
  attempt = attempt || 1;
  try {
    const params = new URLSearchParams({
      q: address,
      format: "json",
      limit: "1",
      countrycodes: "jp",
    });
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": "syuttensien-app-data-update/1.0" },
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!results.length) return null;
    return {
      lat: Number(parseFloat(results[0].lat).toFixed(6)),
      lon: Number(parseFloat(results[0].lon).toFixed(6)),
      displayName: results[0].display_name || "",
    };
  } catch (err) {
    if (attempt >= 3) {
      console.log(`  （通信エラーのため諦めます: ${address} - ${err.message}）`);
      return null;
    }
    console.log(`  （通信エラー、少し待って再試行します: ${err.message}）`);
    await sleep(5000);
    return geocodeOnce(address, attempt + 1);
  }
}

// 番地まで含む住所は見つからないことが多いため、見つかるまで段階的に大まかにする。
// このアプリは半径5〜10km圏の件数集計に使うため、町名レベルの精度で実用上問題ない。
function addressFallbackSteps(address) {
  const steps = [address];
  // 末尾の番地・号・building名らしき部分（最初の数字以降）を削る
  const noNumber = address.replace(/[0-9０-９][0-9０-９\-－ー丁目番号\s].*$/, "");
  if (noNumber && noNumber !== address) steps.push(noNumber);
  // 町名の一部（最後の「町」「丁目」区切りなど）をさらに削る
  const cityOnly = address.match(/^.+?[都道府県].+?[市区町村郡]/);
  if (cityOnly && cityOnly[0] !== steps[steps.length - 1]) steps.push(cityOnly[0]);
  return [...new Set(steps)];
}

// 住所を大まかにするフォールバックで、まったく別の都道府県の
// 同名地名にヒットしてしまうことがあるため、結果が対象の都道府県の
// 範囲内に収まっているか確認し、外れていれば採用しない。
async function geocode(address, prefecture) {
  for (const step of addressFallbackSteps(address)) {
    const result = await geocodeOnce(step);
    if (result && isWithinPrefecture(result.lat, result.lon, prefecture)) {
      return result;
    }
    if (result) {
      console.log(`  （${prefecture}の範囲外のためこの結果は不採用: "${step}" -> ${result.displayName}）`);
    }
    await sleep(NOMINATIM_DELAY_MS);
  }
  return null;
}

function escapeJsString(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// 既存ファイルから「施設名 -> [lat, lon]」の対応表を作る（位置情報の使い回し用）
function loadExistingLocationsByName() {
  const map = new Map();
  if (!fs.existsSync(OUTPUT_FILE)) return map;
  const vm = require("vm");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(OUTPUT_FILE, "utf8") + `\nglobalThis.__data = ${VAR_NAME};`, ctx);
  for (const [lat, lon, name] of ctx.__data || []) {
    if (!map.has(name)) {
      map.set(name, [lat, lon]);
    }
  }
  return map;
}

const PROGRESS_FILE = path.join(__dirname, "..", ".jmap-progress.json");

async function main() {
  let allFacilities = [];
  let failedCombos = [];

  // 前回、JMAP取得の途中（または直後）で処理が止まっていた場合はそこから再開する。
  // JMAP_RESCRAPE=1 を指定すると強制的に最初から取得し直す。
  if (fs.existsSync(PROGRESS_FILE) && process.env.JMAP_RESCRAPE !== "1") {
    const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    allFacilities = progress.allFacilities || [];
    failedCombos = progress.failedCombos || [];
    const donePrefs = new Set(allFacilities.map((f) => f.prefecture));
    console.log(
      `前回の続きから再開します（取得済み${allFacilities.length}件、${donePrefs.size}都道府県分）`
    );
    if (donePrefs.size >= ALL_PREFECTURES.length) {
      console.log("JMAP取得は全都道府県分完了済みのため、この後の位置情報取得から再開します。");
    }
  }

  const donePrefs = new Set(allFacilities.map((f) => f.prefecture));
  const remainingPrefectures = PREFECTURES.filter((p) => !donePrefs.has(p));

  if (remainingPrefectures.length > 0) {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    for (const prefecture of remainingPrefectures) {
      for (const category of CATEGORIES) {
        try {
          const rows = await fetchJmapFacilities(page, prefecture, category);
          allFacilities.push(...rows);
          console.log(`${prefecture} / ${category.type}: ${rows.length}件`);
        } catch (err) {
          console.log(`失敗（2回試しても取得できず、スキップします）: ${prefecture} / ${category.type} - ${err.message}`);
          failedCombos.push(`${prefecture} / ${category.type}`);
        }
        // 取得結果を都度保存しておき、途中で処理が止まっても続きから再開できるようにする
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ allFacilities, failedCombos }, null, 0));
        await sleep(JMAP_DELAY_MS);
      }
    }
    await browser.close();
  }

  if (failedCombos.length > 0) {
    console.log(`\n取得できなかった組み合わせ（${failedCombos.length}件）:`);
    failedCombos.forEach((c) => console.log(`  - ${c}`));
  }

  console.log(`\nJMAP取得合計: ${allFacilities.length}件`);

  // 施設名＋住所の組み合わせが完全に同じ重複を除く（診療所と病院の両区分に
  // またがって同一施設が出ることは無い想定だが、念のため）
  const seen = new Set();
  const uniqueFacilities = allFacilities.filter((f) => {
    const key = `${f.name}|${f.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const existingLocations = loadExistingLocationsByName();
  console.log(`既存データの位置情報: ${existingLocations.size}件（一致すれば使い回す）`);

  // 位置情報取得も、途中で止まっても再開できるよう都度保存する
  const GEOCODE_PROGRESS_FILE = path.join(__dirname, "..", ".jmap-geocode-progress.json");
  const geocodedByKey = new Map();
  if (fs.existsSync(GEOCODE_PROGRESS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(GEOCODE_PROGRESS_FILE, "utf8"));
    for (const [key, value] of saved) geocodedByKey.set(key, value);
    console.log(`位置情報取得の続きから再開します（${geocodedByKey.size}件は取得済み）`);
  }

  const entries = [];
  let geocodedCount = 0;
  let reusedCount = 0;
  let failedCount = 0;
  let sinceLastSave = 0;

  for (const facility of uniqueFacilities) {
    const key = `${facility.name}|${facility.address}`;

    if (geocodedByKey.has(key)) {
      const saved = geocodedByKey.get(key);
      if (saved) entries.push([saved[0], saved[1], facility.name, facility.category]);
      continue;
    }

    const cached = existingLocations.get(facility.name);
    // 同姓同名の別施設（別の都道府県）の位置を誤って使い回さないよう、
    // 都道府県の範囲内に収まっている場合のみ使い回す。
    let result = null;
    if (cached && isWithinPrefecture(cached[0], cached[1], facility.prefecture)) {
      result = cached;
      reusedCount++;
    } else {
      try {
        const geo = await geocode(`${facility.prefecture}${facility.address}`, facility.prefecture);
        if (geo) {
          result = [geo.lat, geo.lon];
          geocodedCount++;
        } else {
          console.log(`位置情報が見つかりませんでした: ${facility.name}（${facility.prefecture}${facility.address}）`);
          failedCount++;
        }
      } catch (err) {
        // 数時間かかる処理のため、想定外のエラーで1件失敗しても全体は止めずに続ける
        console.log(`予期しないエラーのためスキップ: ${facility.name} - ${err.message}`);
        failedCount++;
      }
      await sleep(NOMINATIM_DELAY_MS);
    }

    geocodedByKey.set(key, result);
    if (result) entries.push([result[0], result[1], facility.name, facility.category]);

    sinceLastSave++;
    if (sinceLastSave >= 20) {
      fs.writeFileSync(GEOCODE_PROGRESS_FILE, JSON.stringify([...geocodedByKey]));
      sinceLastSave = 0;
    }
  }
  fs.writeFileSync(GEOCODE_PROGRESS_FILE, JSON.stringify([...geocodedByKey]));

  console.log(`\n位置情報: 使い回し${reusedCount}件 / 新規取得${geocodedCount}件 / 失敗${failedCount}件`);

  const body = entries
    .map(
      ([lat, lon, name, type]) =>
        `  [${lat}, ${lon}, '${escapeJsString(name)}', '${escapeJsString(type)}'],`
    )
    .join("\n");
  const newContent = `const ${VAR_NAME} = [\n${body}\n];\n`;

  const oldContent = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, "utf8") : "";
  if (oldContent === newContent) {
    console.log("変化なし（更新不要）");
  } else {
    fs.writeFileSync(OUTPUT_FILE, newContent, "utf8");
    console.log(`更新しました: ${OUTPUT_FILE}（${entries.length}件）`);
  }

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${oldContent !== newContent}\n`);
  }

  // 正常に完了したので、途中経過用の一時ファイルは削除する
  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
  if (fs.existsSync(GEOCODE_PROGRESS_FILE)) fs.unlinkSync(GEOCODE_PROGRESS_FILE);
}

main().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
