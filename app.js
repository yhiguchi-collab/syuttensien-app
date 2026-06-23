const RADIUS_METERS = 10000;
const DEFAULT_CENTER = { lat: 35.681236, lng: 139.767125 }; // 東京駅

let map;
let geocoder;
let marker;
let circle;

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: DEFAULT_CENTER,
    zoom: 11,
  });
  geocoder = new google.maps.Geocoder();

  map.addListener("click", (event) => {
    setPoint(event.latLng);
  });

  document.getElementById("search-button").addEventListener("click", searchAddress);
  document.getElementById("address-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchAddress();
    }
  });
}

function searchAddress() {
  const address = document.getElementById("address-input").value.trim();
  if (!address) {
    return;
  }

  geocoder.geocode({ address }, (results, status) => {
    if (status !== "OK" || !results[0]) {
      alert("該当する地点が見つかりませんでした");
      return;
    }
    setPoint(results[0].geometry.location);
    map.setZoom(12);
  });
}

function setPoint(location) {
  map.setCenter(location);

  if (marker) {
    marker.setPosition(location);
  } else {
    marker = new google.maps.Marker({ position: location, map });
  }

  if (circle) {
    circle.setCenter(location);
  } else {
    circle = new google.maps.Circle({
      center: location,
      radius: RADIUS_METERS,
      map,
      fillColor: "#2c5f7c",
      fillOpacity: 0.1,
      strokeColor: "#2c5f7c",
      strokeWeight: 2,
    });
  }
}
