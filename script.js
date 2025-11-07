async function fetchRouteData() {
  const url = "https://data.etabus.gov.hk/v1/transport/kmb/route";
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.log("Error fetching route data:", error);
    return null;
  }
}

async function fetchStopData(route, bound) {
  const mappedBound = bound === "O" ? "outbound" : "inbound";
  const direction = mappedBound === "outbound" ? "1" : "2";
  const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${mappedBound}/${direction}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`
      );
    }
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.log(
      `Error fetching stop data for route ${route} (${mappedBound}) with direction ${direction}:`,
      error
    );
    return null;
  }
}

async function fetchStopDetails(stopId) {
  const url = `https://data.etabus.gov.hk/v1/transport/kmb/stop/${stopId}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.log(`Error fetching stop details for stop ${stopId}:`, error);
    return null;
  }
}

async function fetchETAData(stopId, route, serviceType = "1") {
  const stopETAUrl = `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopId}/${route}/${serviceType}`;
  try {
    const response = await fetch(stopETAUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log("ETA Data for stopId", stopId, "and route", route, ":", data); // Debug: Log the raw ETA data
    // Filter for eta_seq 1 to 3
    const filteredData = (data.data || []).filter(
      (eta) => eta.eta_seq >= 1 && eta.eta_seq <= 3
    );
    if (filteredData.length === 0 && serviceType !== "2") {
      console.log("Retrying with serviceType 2");
      return await fetchETAData(stopId, route, "2");
    }
    return filteredData;
  } catch (error) {
    console.error(
      `Error fetching ETA data for stop ${stopId} and route ${route}:`,
      error
    );
    return null;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const routeDiv = document.getElementById("route");
  const stopListDiv = document.getElementById("stopList");
  const etaDiv = document.getElementById("eta");
  const searchInput = document.querySelector("input");
  const searchButton = document.querySelector("button");

  // Fetch route data when the page loads
  const routeData = await fetchRouteData();
  if (!routeData?.data) {
    routeDiv.innerText = "無法載入路線數據，請稍後再試";
    return;
  }

  // 1. Check route
  searchButton.addEventListener("click", async () => {
    const inputRoute = searchInput.value.trim().toUpperCase();

    if (!inputRoute) {
      routeDiv.innerText = "請輸入有效路線號碼";
      stopListDiv.innerText = "";
      etaDiv.innerText = "";
      return;
    }

    // Filter matching routes
    const matchingRoutes = routeData.data.filter(
      (item) => item.route === inputRoute
    );

    // if not match
    if (matchingRoutes.length === 0) {
      routeDiv.innerText = "找不到該路線";
      stopListDiv.innerText = "";
      etaDiv.innerText = "";
      return;
    }

    routeDiv.innerHTML = "";
    stopListDiv.innerHTML = "";
    etaDiv.innerHTML = "";

    // 2. Create route options
    matchingRoutes.forEach((route, index) => {
      const routeOption = document.createElement("div");
      const routeText = `${route.orig_tc} → ${route.dest_tc}`;
      routeOption.innerText = routeText;
      Object.assign(routeOption.style, {
        cursor: "pointer",
        padding: "5px",
        borderRadius: "10px",
        border: "1px solid gray",
      });
      routeDiv.style.gap = "7px";

      // Click each route options
      routeOption.addEventListener("click", async () => {
        routeDiv.querySelectorAll("div").forEach((div) => {
          div.style.backgroundColor = "";
          div.style.transform = "";
        });
        routeOption.style.backgroundColor = "#f0f0f0";
        routeOption.style.transform = "scale(1.02)";

        // fetch stops for the selected route
        const stops = await fetchStopData(route.route, route.bound);
        stopListDiv.innerHTML = etaDiv.innerHTML = "";

        // if no stops are found
        if (stops.length === 0) {
          stopListDiv.innerText = "未能獲取站點信息";
          return;
        }

        // 3. Create stop items
        stops.forEach(async (stop) => {
          const stopItem = document.createElement("div");
          // fetch stop names
          const stopDetails = await fetchStopDetails(stop.stop);
          stopItem.innerText = `${stop.seq}. ${
            stopDetails?.data?.name_tc || "未知站名"
          }`;
          stopItem.classList.add(
            "border-b",
            "border-gray-200",
            "p-2",
            "w-full"
          );
          stopItem.style.cursor = "pointer";

          // click each stop items
          stopItem.addEventListener("click", async () => {
            stopListDiv.querySelectorAll("div").forEach((div) => {
              div.style.backgroundColor = "";
            });
            stopItem.style.backgroundColor = "#e0e0e0";

            // fetch ETA data for the selected stop
            const etaData = await fetchETAData(stop.stop, route.route);
            etaDiv.innerHTML = "";

            // if no ETA data is found
            if (!etaData || etaData.length === 0) {
              etaDiv.innerText = "未能獲取ETA信息，請稍後再試";
              return;
            }

            // 4. Display ETA data
            etaData.forEach((eta) => {
              const etaItem = document.createElement("div");
              const realTime = eta.eta
                ? new Date(eta.eta).toLocaleTimeString()
                : "無實時數據";
              const scheduledTime =
                eta.rmk_tc ||
                (eta.eta
                  ? new Date(eta.eta).toLocaleTimeString()
                  : "無原定班次");

              // Handle realTime / scheduleTime for eta_seq: 1
              let isDelayed = false;
              if (eta.eta_seq === 1 && eta.eta && eta.rmk_tc) {
                const realTimeDate = new Date(eta.eta);
                const scheduledTimeMatch = eta.rmk_tc.match(/(\d{2}):(\d{2})/);
                if (scheduledTimeMatch) {
                  const scheduledDate = new Date();
                  scheduledDate.setHours(
                    parseInt(scheduledTimeMatch[1], 10),
                    parseInt(scheduledTimeMatch[2], 10),
                    0,
                    0
                  );
                  isDelayed = realTimeDate > scheduledDate;
                }
              }

              // Format to display 1,2,3 ETA time
              if (eta.eta_seq === 1) {
                etaItem.innerText = isDelayed
                  ? `第 ${eta.eta_seq} 班 (延誤)  :  實時:  ${realTime}`
                  : `第 ${eta.eta_seq} 班   :   ${realTime}   實時班次`;
                if (isDelayed) etaItem.classList.add("text-red-500");
              } else {
                etaItem.innerText = `第 ${eta.eta_seq} 班   :   ${scheduledTime}   原定班次`;
              }

              etaItem.classList.add(
                "text-2xl",
                "text-gray-700",
                "py-2",
                "border-b",
                "border-gray-200",
                "last:border-0",
                "text-center"
              );
              etaDiv.append(etaItem);
            });
          });

          stopListDiv.append(stopItem);
        });
      });

      routeDiv.append(routeOption);
      if (index === 0) routeOption.click();
    });
  });
});
