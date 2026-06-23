const RADIUS_METERS = 10000;
const DEFAULT_CENTER = [35.681236, 139.767125]; // 東京駅
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

let map;
let marker;
let circle;

function initMap() {
  map = L.map("map").setView(DEFAULT_CENTER, 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

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

  if (marker) {
    marker.setLatLng([lat, lng]);
  } else {
    marker = L.marker([lat, lng]).addTo(map);
  }

  if (circle) {
    circle.setLatLng([lat, lng]);
  } else {
    circle = L.circle([lat, lng], {
      radius: RADIUS_METERS,
      color: "#2c5f7c",
      fillColor: "#2c5f7c",
      fillOpacity: 0.1,
      weight: 2,
    }).addTo(map);
  }
}

document.addEventListener("DOMContentLoaded", initMap);
