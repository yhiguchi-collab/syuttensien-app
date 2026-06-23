// e-Stat API（令和2年国勢調査 1kmメッシュ統計）を用いた年齢別人口集計。

const ESTAT_API_BASE = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData";
const ESTAT_CD_AREA_LIMIT = 100; // e-Stat APIのcdAreaは1リクエストあたり100件まで

// cat01コード: 年齢区分
const AGE_CATEGORIES = [
  { code: "0010", label: "総人口" },
  { code: "0040", label: "0〜14歳" },
  { code: "0100", label: "15〜64歳" },
  { code: "0190", label: "65歳以上" },
  { code: "0220", label: "75歳以上" },
];

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function groupMeshCodesByMesh1(meshCodes) {
  const groups = {};
  for (const code of meshCodes) {
    const mesh1 = code.slice(0, 4);
    if (!groups[mesh1]) {
      groups[mesh1] = [];
    }
    groups[mesh1].push(code);
  }
  return groups;
}

async function fetchAgePopulationInRadius(meshCodes) {
  const groups = groupMeshCodesByMesh1(meshCodes);
  const totals = {};
  for (const category of AGE_CATEGORIES) {
    totals[category.code] = 0;
  }

  const requests = [];

  for (const [mesh1, codes] of Object.entries(groups)) {
    const statsDataId = MESH1_TABLE_IDS[mesh1];
    if (!statsDataId) {
      continue;
    }

    for (const chunk of chunkArray(codes, ESTAT_CD_AREA_LIMIT)) {
      requests.push(
        (async () => {
          const params = new URLSearchParams({
            appId: ESTAT_APP_ID,
            statsDataId,
            cdArea: chunk.join(","),
            cdCat01: AGE_CATEGORIES.map((c) => c.code).join(","),
          });

          const response = await fetch(`${ESTAT_API_BASE}?${params}`);
          const json = await response.json();
          const dataInf = json.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF;
          const values = dataInf && dataInf.VALUE ? dataInf.VALUE : [];
          const valueArray = Array.isArray(values) ? values : [values];

          for (const value of valueArray) {
            const num = Number(value["$"]);
            if (!Number.isNaN(num)) {
              totals[value["@cat01"]] = (totals[value["@cat01"]] || 0) + num;
            }
          }
        })()
      );
    }
  }

  await Promise.all(requests);

  return AGE_CATEGORIES.map((category) => ({
    label: category.label,
    value: totals[category.code],
  }));
}
