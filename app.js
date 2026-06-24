const RADIUS_METERS = 10000;
const DEFAULT_CENTER = [33.590355, 130.401716]; // 福岡市（天神）
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

let map;
let marker;
let circle;
let circleHalo;

function initMap() {
  const worldBounds = L.latLngBounds([-90, -180], [90, 180]);

  map = L.map("map", {
    maxBounds: worldBounds,
    maxBoundsViscosity: 1.0,
  }).setView(DEFAULT_CENTER, 11);

  const GSI_ATTRIBUTION = '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>';

  const streetLayer = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
    attribution: GSI_ATTRIBUTION,
    maxZoom: 18,
    noWrap: true,
  });

  const satelliteLayer = L.tileLayer(
    "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
    {
      attribution: GSI_ATTRIBUTION,
      maxZoom: 18,
      noWrap: true,
    }
  ).addTo(map);

  const labelsLayer = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
    attribution: GSI_ATTRIBUTION,
    maxZoom: 18,
    noWrap: true,
    className: "gsi-label-overlay",
  }).addTo(map);

  L.control
    .layers(
      { "地図": streetLayer, "航空写真": satelliteLayer },
      { "地名ラベル": labelsLayer }
    )
    .addTo(map);

  map.on("click", (event) => {
    setPoint(event.latlng.lat, event.latlng.lng);
  });

  document.getElementById("search-button").addEventListener("click", searchAddress);
  document.getElementById("address-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchAddress();
    }
  });
}

async function searchAddress() {
  const address = document.getElementById("address-input").value.trim();
  if (!address) {
    return;
  }

  const params = new URLSearchParams({ q: address, format: "json", limit: "1" });

  try {
    const response = await fetch(`${NOMINATIM_URL}?${params}`);
    const results = await response.json();

    if (results.length === 0) {
      alert("該当する地点が見つかりませんでした");
      return;
    }

    const { lat, lon } = results[0];
    setPoint(parseFloat(lat), parseFloat(lon));
    map.setZoom(12);
  } catch (error) {
    alert("検索中にエラーが発生しました");
  }
}

function setPoint(lat, lng) {
  map.setView([lat, lng]);

  const meshCodes = getMeshCodesInRadius(lat, lng, RADIUS_METERS);
  updatePopulationPanel(meshCodes);
  updateChiikiKubunPanel(lat, lng);
  updateHoukanStPanel(lat, lng);
  updateHospitalPanel(lat, lng);

  if (marker) {
    marker.setLatLng([lat, lng]);
  } else {
    marker = L.marker([lat, lng]).addTo(map);
  }

  if (circleHalo) {
    circleHalo.setLatLng([lat, lng]);
  } else {
    circleHalo = L.circle([lat, lng], {
      radius: RADIUS_METERS,
      color: "#ffffff",
      weight: 6,
      fill: false,
    }).addTo(map);
  }

  if (circle) {
    circle.setLatLng([lat, lng]);
  } else {
    circle = L.circle([lat, lng], {
      radius: RADIUS_METERS,
      color: "#d6336c",
      fillColor: "#d6336c",
      fillOpacity: 0.1,
      weight: 3,
    }).addTo(map);
  }
}

async function updatePopulationPanel(meshCodes) {
  const statusEl = document.getElementById("info-status");
  const listEl = document.getElementById("population-list");

  statusEl.textContent = "人口データを取得中…";
  listEl.innerHTML = "";

  try {
    const results = await fetchAgePopulationInRadius(meshCodes);
    statusEl.textContent = "令和2年国勢調査（1kmメッシュ）に基づく集計";
    listEl.innerHTML = results
      .map((r) => `<li><span>${r.label}</span><span>${r.value.toLocaleString()}人</span></li>`)
      .join("");
  } catch (error) {
    statusEl.textContent = "人口データの取得に失敗しました";
  }
}

async function updateChiikiKubunPanel(lat, lng) {
  const statusEl = document.getElementById("chiiki-status");
  const valueEl = document.getElementById("chiiki-value");

  statusEl.textContent = "市区町村を判定中…";
  valueEl.textContent = "";

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "json",
      "accept-language": "ja",
    });
    const response = await fetch(`${NOMINATIM_REVERSE_URL}?${params}`);
    const result = await response.json();
    const address = result.address || {};

    const isoCode = address["ISO3166-2-lvl4"];
    const prefecture = (isoCode && JP_PREFECTURE_BY_ISO_CODE[isoCode]) || address.province || address.state;
    const municipality =
      address.city || address.town || address.village || address.city_district || address.municipality;

    if (!prefecture || !municipality) {
      statusEl.textContent = "市区町村を特定できませんでした";
      return;
    }

    const grade = getChiikiKubunGrade(prefecture, municipality);
    statusEl.textContent = `${prefecture}${municipality}`;
    valueEl.textContent = getChiikiKubunLabel(grade);
  } catch (error) {
    statusEl.textContent = "地域区分の取得に失敗しました";
  }
}

function updateHoukanStPanel(lat, lng) {
  const statusEl = document.getElementById("houkan-status");
  const count = countFacilitiesInRadius(HOUKAN_ST_DATA, lat, lng, RADIUS_METERS);
  statusEl.textContent = `${count.toLocaleString()}件（厚労省 介護サービス情報公表システムより）`;
}

function updateHospitalPanel(lat, lng) {
  const generalCount = countFacilitiesInRadius(HOSPITAL_GENERAL_DATA, lat, lng, RADIUS_METERS);
  const psychiatricCount = countFacilitiesInRadius(HOSPITAL_PSYCHIATRIC_DATA, lat, lng, RADIUS_METERS);

  document.getElementById("hospital-general-status").textContent =
    `総合病院: ${generalCount.toLocaleString()}件`;
  document.getElementById("hospital-psychiatric-status").textContent =
    `精神科: ${psychiatricCount.toLocaleString()}件`;
}

document.addEventListener("DOMContentLoaded", initMap);
