// 標準地域メッシュ（JIS X0410）の3次メッシュ（約1km四方）に関するユーティリティ。
// 国勢調査の地域メッシュ統計（e-Stat）は3次メッシュ単位で集計されているため、
// 検索地点を中心とした円の範囲に含まれるメッシュコードを算出するために使用する。

const EARTH_RADIUS_METERS = 6371000;

function toMeshCode3(lat, lon) {
  const latMin = lat * 60;

  const mesh1Lat = Math.floor(latMin / 40);
  const mesh1Lon = Math.floor(lon) - 100;

  const r2Lat = latMin - mesh1Lat * 40;
  const r2Lon = (lon - Math.floor(lon)) * 60;

  const mesh2Lat = Math.floor(r2Lat / 5);
  const mesh2Lon = Math.floor(r2Lon / 7.5);

  const r3Lat = r2Lat - mesh2Lat * 5;
  const r3Lon = r2Lon - mesh2Lon * 7.5;

  const mesh3Lat = Math.floor((r3Lat * 60) / 30);
  const mesh3Lon = Math.floor((r3Lon * 60) / 45);

  const pad2 = (n) => String(n).padStart(2, "0");
  return `${pad2(mesh1Lat)}${pad2(mesh1Lon)}${mesh2Lat}${mesh2Lon}${mesh3Lat}${mesh3Lon}`;
}

function meshCode3ToBounds(code) {
  const mesh1Lat = Number(code.slice(0, 2));
  const mesh1Lon = Number(code.slice(2, 4));
  const mesh2Lat = Number(code.slice(4, 5));
  const mesh2Lon = Number(code.slice(5, 6));
  const mesh3Lat = Number(code.slice(6, 7));
  const mesh3Lon = Number(code.slice(7, 8));

  const south = (mesh1Lat * 40 + mesh2Lat * 5 + mesh3Lat * (30 / 60)) / 60;
  const west = mesh1Lon + 100 + (mesh2Lon * 7.5 + mesh3Lon * (45 / 60)) / 60;
  const north = south + 30 / 60 / 60;
  const east = west + 45 / 60 / 60;

  return { south, north, west, east };
}

function meshCode3Center(code) {
  const { south, north, west, east } = meshCode3ToBounds(code);
  return { lat: (south + north) / 2, lon: (west + east) / 2 };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const a =
    sinDLat * sinDLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

// 中心地点から指定半径内に中心点が含まれる3次メッシュのコード一覧を返す。
function getMeshCodesInRadius(centerLat, centerLon, radiusMeters) {
  const latStepDeg = 30 / 60 / 60; // 3次メッシュの緯度幅(度)
  const lonStepDeg = 45 / 60 / 60; // 3次メッシュの経度幅(度)

  const latDelta = radiusMeters / 111320; // 緯度1度あたり約111.32km
  const lonDelta =
    radiusMeters / (111320 * Math.cos((centerLat * Math.PI) / 180));

  const codes = [];

  for (let lat = centerLat - latDelta; lat <= centerLat + latDelta; lat += latStepDeg) {
    for (let lon = centerLon - lonDelta; lon <= centerLon + lonDelta; lon += lonStepDeg) {
      const code = toMeshCode3(lat, lon);
      const { lat: meshLat, lon: meshLon } = meshCode3Center(code);
      if (haversineMeters(centerLat, centerLon, meshLat, meshLon) <= radiusMeters) {
        if (!codes.includes(code)) {
          codes.push(code);
        }
      }
    }
  }

  return codes;
}
