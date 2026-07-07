let RADIUS_METERS = 10000;
const DEFAULT_CENTER = [33.590355, 130.401716]; // 福岡市（天神）
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

let map;
let marker;
let circle;
let circleHalo;
let currentLat;
let currentLng;

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

  const ownStoreIcon = L.divIcon({
    className: "own-store-icon",
    html: "★",
    iconSize: [24, 24],
  });

  let ownStoreHoverCircle = null;
  const fixedStoreCircles = new Map();
  const fixedCircleHistory = []; // { layer, marker } の順序付き履歴（marker は店舗固定時のみ設定）

  function makeOwnStoreCircle(lat, lng) {
    return L.circle([lat, lng], {
      radius: RADIUS_METERS,
      color: "#ffb400",
      fillColor: "#ffb400",
      fillOpacity: 0.08,
      weight: 3,
    });
  }

  const hoverPanel = document.createElement("div");
  hoverPanel.id = "store-hover-panel";
  hoverPanel.innerHTML =
    '<span class="store-hover-panel-name"></span><button type="button" class="fix-circle-button"></button>';
  map.getContainer().appendChild(hoverPanel);
  const hoverPanelName = hoverPanel.querySelector(".store-hover-panel-name");
  const hoverPanelButton = hoverPanel.querySelector(".fix-circle-button");
  let hoverPanelMarker = null;
  let hidePanelTimer = null;

  function updateMainCircleVisibility() {
    if (!circle) {
      return;
    }
    const hidden = fixedStoreCircles.size > 0;
    circle.setStyle({ opacity: hidden ? 0 : 1, fillOpacity: hidden ? 0 : 0.1 });
    if (circleHalo) {
      circleHalo.setStyle({ opacity: hidden ? 0 : 1 });
    }
  }

  function updateFixButtonLabel() {
    if (hoverPanelMarker) {
      hoverPanelButton.textContent = fixedStoreCircles.has(hoverPanelMarker) ? "円を解除" : "円を固定";
    }
  }

  function hideHoverPanel() {
    hoverPanel.style.display = "none";
    hoverPanelMarker = null;
    if (ownStoreHoverCircle) {
      map.removeLayer(ownStoreHoverCircle);
      ownStoreHoverCircle = null;
    }
  }

  function scheduleHideHoverPanel() {
    clearTimeout(hidePanelTimer);
    hidePanelTimer = setTimeout(hideHoverPanel, 250);
  }

  hoverPanel.addEventListener("mouseenter", () => clearTimeout(hidePanelTimer));
  hoverPanel.addEventListener("mouseleave", scheduleHideHoverPanel);

  hoverPanelButton.addEventListener("click", () => {
    const ownMarker = hoverPanelMarker;
    if (!ownMarker) {
      return;
    }
    const { lat, lng } = ownMarker.getLatLng();
    if (fixedStoreCircles.has(ownMarker)) {
      map.removeLayer(fixedStoreCircles.get(ownMarker));
      fixedStoreCircles.delete(ownMarker);
      const index = fixedCircleHistory.findIndex((entry) => entry.marker === ownMarker);
      if (index !== -1) {
        fixedCircleHistory.splice(index, 1);
      }
    } else {
      if (ownStoreHoverCircle) {
        map.removeLayer(ownStoreHoverCircle);
        ownStoreHoverCircle = null;
      }
      const newCircle = makeOwnStoreCircle(lat, lng).addTo(map);
      fixedStoreCircles.set(ownMarker, newCircle);
      fixedCircleHistory.push({ layer: newCircle, marker: ownMarker });
    }
    updateFixButtonLabel();
    updateMainCircleVisibility();
  });

  const ownStoreLayer = L.layerGroup(
    OWN_STORE_DATA.map(([lat, lng, name]) => {
      const ownMarker = L.marker([lat, lng], { icon: ownStoreIcon });

      ownMarker.on("mouseover", () => {
        clearTimeout(hidePanelTimer);
        if (ownStoreHoverCircle) {
          map.removeLayer(ownStoreHoverCircle);
          ownStoreHoverCircle = null;
        }
        hoverPanelMarker = ownMarker;
        hoverPanelName.textContent = name;
        updateFixButtonLabel();

        const point = map.latLngToContainerPoint([lat, lng]);
        hoverPanel.style.left = `${point.x}px`;
        hoverPanel.style.top = `${point.y - 50}px`;
        hoverPanel.style.display = "block";

        if (!fixedStoreCircles.has(ownMarker) && fixedStoreCircles.size === 0) {
          ownStoreHoverCircle = makeOwnStoreCircle(lat, lng).addTo(map);
        }
      });
      ownMarker.on("mouseout", scheduleHideHoverPanel);

      return ownMarker;
    })
  ).addTo(map);

  document.getElementById("reset-fixed-circles-button").addEventListener("click", () => {
    fixedCircleHistory.forEach((entry) => map.removeLayer(entry.layer));
    fixedCircleHistory.length = 0;
    fixedStoreCircles.clear();
    updateMainCircleVisibility();
  });

  document.getElementById("undo-fixed-circle-button").addEventListener("click", () => {
    const lastEntry = fixedCircleHistory.pop();
    if (!lastEntry) {
      return;
    }
    map.removeLayer(lastEntry.layer);
    if (lastEntry.marker) {
      fixedStoreCircles.delete(lastEntry.marker);
    }
    updateMainCircleVisibility();
  });

  L.control
    .layers(
      { "地図": streetLayer, "航空写真": satelliteLayer },
      { "地名ラベル": labelsLayer, "自社店舗": ownStoreLayer }
    )
    .addTo(map);

  document.getElementById("fix-current-circle-button").addEventListener("click", () => {
    if (currentLat === undefined) {
      return;
    }
    const newCircle = makeOwnStoreCircle(currentLat, currentLng).addTo(map);
    fixedCircleHistory.push({ layer: newCircle, marker: null });
  });

  map.on("click", (event) => {
    setPoint(event.latlng.lat, event.latlng.lng);
  });

  document.getElementById("search-button").addEventListener("click", searchAddress);
  document.getElementById("address-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchAddress();
    }
  });

  document.querySelectorAll(".radius-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".radius-button").forEach((b) => b.classList.remove("is-active"));
      button.classList.add("is-active");
      RADIUS_METERS = parseInt(button.dataset.radius, 10);
      document.getElementById("population-heading").textContent =
        `半径${RADIUS_METERS / 1000}km圏内の年齢別人口`;

      fixedCircleHistory.forEach((entry) => entry.layer.setRadius(RADIUS_METERS));

      if (currentLat !== undefined) {
        setPoint(currentLat, currentLng);
      }
    });
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
    setPoint(parseFloat(lat), parseFloat(lon), 12);
  } catch (error) {
    alert("検索中にエラーが発生しました");
  }
}

function setPoint(lat, lng, zoom) {
  currentLat = lat;
  currentLng = lng;
  map.setView([lat, lng], zoom !== undefined ? zoom : map.getZoom());

  const meshCodes = getMeshCodesInRadius(lat, lng, RADIUS_METERS);
  updatePopulationPanel(meshCodes);
  updateEvaluationPanel(lat, lng);
  updateChiikiKubunPanel(lat, lng);
  updateHoukanStPanel(lat, lng);
  updateHospitalPanel(lat, lng);
  updateHomeVisitPanel(lat, lng);
  updateCaremanagerPanel(lat, lng);
  updateComprehensiveSupportPanel(lat, lng);
  updateConsultationOfficePanel(lat, lng);

  if (marker) {
    marker.setLatLng([lat, lng]);
  } else {
    marker = L.marker([lat, lng]).addTo(map);
  }

  if (circleHalo) {
    circleHalo.setLatLng([lat, lng]);
    circleHalo.setRadius(RADIUS_METERS);
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
    circle.setRadius(RADIUS_METERS);
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

function recalculateEvaluation() {
  const itemsEl = document.getElementById("evaluation-items");
  if (!itemsEl || itemsEl.style.display === "none") {
    return;
  }
  const demandScore = parseInt(itemsEl.dataset.demandScore || "0");
  const salesScore = parseInt(itemsEl.dataset.salesScore || "0");
  const overlapScore = parseInt(itemsEl.dataset.overlapScore || "0");
  const competitionScore = parseInt(document.querySelector('input[name="eval-competition"]:checked')?.value || "12");
  const mobilityScore = parseInt(document.querySelector('input[name="eval-mobility"]:checked')?.value || "9");
  const hiringScore = parseInt(document.querySelector('input[name="eval-hiring"]:checked')?.value || "9");

  document.getElementById("eval-points-competition").textContent = `${competitionScore}点`;
  document.getElementById("eval-points-mobility").textContent = `${mobilityScore}点`;
  document.getElementById("eval-points-hiring").textContent = `${hiringScore}点`;

  const total = demandScore + competitionScore + salesScore + mobilityScore + hiringScore + overlapScore;
  const grade = total >= 80 ? "A" : total >= 60 ? "B" : "C";

  const gradeEl = document.getElementById("evaluation-grade");
  gradeEl.textContent = grade;
  gradeEl.className = `eval-grade-${grade}`;
  document.getElementById("evaluation-score").textContent = `${total}点`;
}

document.querySelectorAll('input[name="eval-competition"], input[name="eval-mobility"], input[name="eval-hiring"]')
  .forEach((radio) => radio.addEventListener("change", recalculateEvaluation));

async function updateEvaluationPanel(lat, lng) {
  const statusEl = document.getElementById("evaluation-status");
  const itemsEl = document.getElementById("evaluation-items");
  statusEl.textContent = "評価を計算中…";
  itemsEl.style.display = "none";

  const st5km = countFacilitiesInRadius(HOUKAN_ST_DATA, lat, lng, 5000);
  const hospital5km = countFacilitiesInRadius(HOSPITAL_GENERAL_DATA, lat, lng, 5000);

  const meshCodes5km = getMeshCodesInRadius(lat, lng, 5000);
  let pop75plus = 0;
  try {
    const results5km = await fetchAgePopulationInRadius(meshCodes5km);
    pop75plus = results5km.find((r) => r.label === "75歳以上")?.value || 0;
  } catch (_) {
    pop75plus = 0;
  }

  const demandRatio = st5km > 0 ? pop75plus / st5km : 0;
  let demandScore, demandLabel;
  if (demandRatio > 1500) { demandScore = 30; demandLabel = "多い"; }
  else if (demandRatio >= 800) { demandScore = 18; demandLabel = "普通"; }
  else { demandScore = 6; demandLabel = "少ない"; }
  document.getElementById("eval-detail-demand").textContent =
    `${pop75plus.toLocaleString()}人 ÷ ${st5km}件 = ${Math.round(demandRatio)}（${demandLabel}）`;
  document.getElementById("eval-points-demand").textContent = `${demandScore}点`;

  let salesScore, salesLabel;
  if (hospital5km >= 2) { salesScore = 20; salesLabel = "複数"; }
  else if (hospital5km === 1) { salesScore = 12; salesLabel = "1件"; }
  else { salesScore = 4; salesLabel = "なし"; }
  document.getElementById("eval-detail-sales").textContent =
    `総合病院 ${hospital5km}件（${salesLabel}）`;
  document.getElementById("eval-points-sales").textContent = `${salesScore}点`;

  const nearbyOwn = OWN_STORE_DATA.filter(([sLat, sLng]) => haversineMeters(lat, lng, sLat, sLng) < 8000);
  let overlapScore = 0;
  if (nearbyOwn.length > 0) {
    overlapScore = -10;
    document.getElementById("eval-detail-overlap").textContent =
      nearbyOwn.map((s) => s[2].replace("訪問看護ステーションととのい ", "")).join("・") + " が8km圏内";
    document.getElementById("eval-points-overlap").textContent = "−10点";
    document.getElementById("eval-row-overlap").classList.add("eval-overlap-warning");
  } else {
    overlapScore = 0;
    document.getElementById("eval-detail-overlap").textContent = "重複なし";
    document.getElementById("eval-points-overlap").textContent = "0点";
    document.getElementById("eval-row-overlap").classList.remove("eval-overlap-warning");
  }

  itemsEl.dataset.demandScore = demandScore;
  itemsEl.dataset.salesScore = salesScore;
  itemsEl.dataset.overlapScore = overlapScore;
  itemsEl.style.display = "block";
  statusEl.textContent = "";
  recalculateEvaluation();
}

async function updatePopulationPanel(meshCodes) {
  const statusEl = document.getElementById("info-status");
  const listEl = document.getElementById("population-list");

  statusEl.textContent = "人口データを取得中…";
  listEl.innerHTML = "";

  try {
    const results = await fetchAgePopulationInRadius(meshCodes);
    const totalPop = results.length > 0 ? results[0].value : 0; // 総人口（先頭行）を分母にする
    statusEl.textContent = "令和2年国勢調査（1kmメッシュ）に基づく集計";
    listEl.innerHTML = results
      .map((r, i) => {
        const pct = i === 0 ? "" : (totalPop > 0 ? `<span class="pct">（${(r.value / totalPop * 100).toFixed(1)}%）</span>` : "");
        return `<li><span>${r.label}</span><span>${r.value.toLocaleString()}人${pct}</span></li>`;
      })
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
    `精神科病院: ${psychiatricCount.toLocaleString()}件`;
}

function updateHomeVisitPanel(lat, lng) {
  const statusEl = document.getElementById("home-visit-status");
  const count = countFacilitiesInRadius(HOME_VISIT_CLINIC_DATA, lat, lng, RADIUS_METERS);
  statusEl.textContent = `${count.toLocaleString()}件（在宅療養支援診療所・病院＝機能強化型のみ）`;
}

function updateCaremanagerPanel(lat, lng) {
  const statusEl = document.getElementById("caremanager-status");
  const count = countFacilitiesInRadius(CAREMANAGER_OFFICE_DATA, lat, lng, RADIUS_METERS);
  statusEl.textContent = `居宅介護支援事業所　${count.toLocaleString()}件`;
}

function updateComprehensiveSupportPanel(lat, lng) {
  const statusEl = document.getElementById("comprehensive-support-status");
  const count = countFacilitiesInRadius(COMPREHENSIVE_SUPPORT_CENTER_DATA, lat, lng, RADIUS_METERS);
  statusEl.textContent = `地域包括支援センター　${count.toLocaleString()}件`;
}

function updateConsultationOfficePanel(lat, lng) {
  const officeCount = countFacilitiesInRadius(CONSULTATION_OFFICE_DATA, lat, lng, RADIUS_METERS);
  const coreCount = countFacilitiesInRadius(CORE_CONSULTATION_CENTER_DATA, lat, lng, RADIUS_METERS);

  document.getElementById("consultation-office-status").textContent =
    `相談支援事業所　${officeCount.toLocaleString()}件`;
  document.getElementById("core-consultation-status").textContent =
    `基幹相談支援センター　${coreCount.toLocaleString()}件`;
}

document.addEventListener("DOMContentLoaded", initMap);
