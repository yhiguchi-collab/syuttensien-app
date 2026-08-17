// 厚生労働省「介護サービス情報公表システム オープンデータ」から
// 訪問看護ステーション（サービス種別コード130）・居宅介護支援事業所（同430）の
// 最新CSVを取得し、houkan-st-data.js / caremanager-office-data.js を作り直す。
//
// 使い方: node scripts/update-kaigo-opendata.js
//
// 情報源は年2回（6月末・12月末時点）しか更新されないため、
// 毎月実行しても多くの月は「変化なし」になる想定。

const fs = require("fs");
const path = require("path");

const INDEX_URL = "https://www.mhlw.go.jp/stf/kaigo-kouhyou_opendata.html";
const BASE_URL = "https://www.mhlw.go.jp";

const TARGETS = [
  {
    serviceCode: "130",
    varName: "HOUKAN_ST_DATA",
    outputFile: path.join(__dirname, "..", "houkan-st-data.js"),
    label: "訪問看護ステーション",
  },
  {
    serviceCode: "430",
    varName: "CAREMANAGER_OFFICE_DATA",
    outputFile: path.join(__dirname, "..", "caremanager-office-data.js"),
    label: "居宅介護支援事業所（ケアマネジャー）",
  },
];

// 簡易CSVパーサー（ダブルクォート囲み・カンマ/改行の埋め込みに対応）
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function findLatestCsvUrl(serviceCode) {
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`一覧ページの取得に失敗: HTTP ${res.status}`);
  const html = await res.text();

  // 例: href="/content/12300000/jigyosho_130_all_20260709180342.csv"
  const pattern = new RegExp(
    `href="(/content/\\d+/jigyosho_${serviceCode}_all_\\d+\\.csv)"`
  );
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`サービス種別コード${serviceCode}のCSVリンクが見つかりませんでした`);
  }
  return BASE_URL + match[1];
}

function escapeJsString(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function updateTarget(target) {
  console.log(`\n=== ${target.label}（コード${target.serviceCode}） ===`);
  const url = await findLatestCsvUrl(target.serviceCode);
  console.log("取得先:", url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`CSVの取得に失敗: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString("utf8").replace(/^﻿/, "");

  const rows = parseCsv(text);
  const header = rows[0];
  const nameIdx = header.indexOf("事業所名");
  const latIdx = header.indexOf("緯度");
  const lonIdx = header.indexOf("経度");

  if (nameIdx === -1 || latIdx === -1 || lonIdx === -1) {
    throw new Error("CSVの列構成が想定と異なります（事業所名・緯度・経度が見つかりません）");
  }

  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length <= Math.max(nameIdx, latIdx, lonIdx)) continue;
    // CSV側の緯度経度が "141.330213299999970" のように浮動小数点誤差混じりの
    // 長い桁で入っているため、小数点以下6桁（約11cm精度）に丸めてから使う
    const lat = parseFloat(r[latIdx]);
    const lon = parseFloat(r[lonIdx]);
    const name = (r[nameIdx] || "").trim();
    if (!name || Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const latClean = Number(lat.toFixed(6));
    const lonClean = Number(lon.toFixed(6));
    entries.push([latClean, lonClean, name]);
  }

  console.log(`件数: ${entries.length}件`);

  const body = entries
    .map(([lat, lon, name]) => `  [${lat}, ${lon}, '${escapeJsString(name)}'],`)
    .join("\n");
  const newContent = `const ${target.varName} = [\n${body}\n];\n`;

  const oldContent = fs.existsSync(target.outputFile)
    ? fs.readFileSync(target.outputFile, "utf8")
    : "";

  if (oldContent === newContent) {
    console.log("変化なし（更新不要）");
    return { changed: false, label: target.label, count: entries.length };
  }

  fs.writeFileSync(target.outputFile, newContent, "utf8");
  console.log(`更新しました: ${target.outputFile}`);
  return { changed: true, label: target.label, count: entries.length };
}

async function main() {
  const results = [];
  for (const target of TARGETS) {
    results.push(await updateTarget(target));
  }

  const changed = results.filter((r) => r.changed);
  console.log("\n=== まとめ ===");
  results.forEach((r) => console.log(`${r.label}: ${r.count}件（${r.changed ? "更新あり" : "変化なし"}）`));

  // GitHub Actions側でコミットするかどうかを判定できるようにする
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.length > 0}\n`);
  }
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
