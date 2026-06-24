// 半径圏内の施設件数を集計する汎用ロジック。
// データは [緯度, 経度, 名称] の配列（例: HOUKAN_ST_DATA）を想定。

function countFacilitiesInRadius(facilities, centerLat, centerLon, radiusMeters) {
  let count = 0;
  for (const [lat, lon] of facilities) {
    if (haversineMeters(centerLat, centerLon, lat, lon) <= radiusMeters) {
      count++;
    }
  }
  return count;
}
