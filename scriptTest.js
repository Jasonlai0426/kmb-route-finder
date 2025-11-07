// Fetch route data
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

// Fetch stop data for a route
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

// Fetch stop details
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

// Fetch ETA data for a stop
async function fetchETAData(stopId, route, serviceType = "1") {
  const stopETAUrl = `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopId}/${route}/${serviceType}`;
  try {
    const response = await fetch(stopETAUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const filteredData = (data.data || []).filter(
      (eta) => eta.eta_seq >= 1 && eta.eta_seq <= 3
    );

    // If fewer than 3 ETAs, try other service types
    if (filteredData.length < 3) {
      const altServiceTypes = ["2", "3", "4"]; // Adjust based on API docs
      for (const altType of altServiceTypes) {
        if (altType === serviceType) continue;
        const altData = await fetchETAData(stopId, route, altType);
        if (altData?.length) {
          filteredData.push(
            ...altData.filter(
              (eta) => eta.eta_seq > filteredData.length && eta.eta_seq <= 3
            )
          );
          if (filteredData.length >= 3) break;
        }
      }
    }
    return filteredData.sort((a, b) => a.eta_seq - b.eta_seq); // Ensure order
  } catch (error) {
    console.error(`Error fetching ETA for stop ${stopId}:`, error);
    return null;
  }
}

// Main logic
document.addEventListener("DOMContentLoaded", async () => {
  const routeDiv = document.getElementById("route");
  const stopListDiv = document.getElementById("stopList");
  const etaDiv = document.getElementById("eta");
  const overlay = document.getElementById("overlay");
  const searchInput = document.querySelector("input");
  const searchButton = document.querySelector("button");

  const routeData = await fetchRouteData();
  if (!routeData?.data) {
    routeDiv.innerText = "無法載入路線數據，請稍後再試";
    return;
  }

  const clearDisplay = () => {
    routeDiv.innerHTML = stopListDiv.innerHTML = etaDiv.innerHTML = "";
    etaDiv.classList.add("hidden");
    overlay.classList.add("hidden");
  };

  const createDiv = (text, classes) => {
    const div = document.createElement("div");
    div.innerText = text;
    div.classList.add(...classes);
    return div;
  };

  // 1. Check route
  searchButton.addEventListener("click", async () => {
    const inputRoute = searchInput.value.trim().toUpperCase();
    if (!inputRoute) {
      routeDiv.innerText = "請輸入有效路線號碼";
      return clearDisplay();
    }

    // if not match
    const routes = routeData.data.filter((item) => item.route === inputRoute);
    if (!routes.length) {
      routeDiv.innerText = "找不到該路線";
      return clearDisplay();
    }

    clearDisplay();
    routeDiv.classList.add("gap-2");

    // 2. Create route options
    routes.forEach((route, index) => {
      const routeOption = createDiv(`${route.orig_tc} → ${route.dest_tc}`, [
        "cursor-pointer",
        "p-2",
        "rounded-lg",
        "border",
        "border-gray-300",
        "hover:bg-gray-100",
      ]);

      // Click each route options
      routeOption.addEventListener("click", async () => {
        routeDiv
          .querySelectorAll("div")
          .forEach((div) => div.classList.remove("bg-gray-200", "scale-105"));
        routeOption.classList.add("bg-gray-200", "scale-105");

        // fetch stops for the selected route
        const stops = await fetchStopData(route.route, route.bound);
        stopListDiv.innerHTML = etaDiv.innerHTML = "";
        etaDiv.classList.add("hidden");
        overlay.classList.add("hidden");

        // if no stops are found
        if (!stops.length) {
          stopListDiv.innerText = "未能獲取站點信息";
          return;
        }

        // 3. Create stop items
        stops.forEach(async (stop) => {
          const stopDetails = await fetchStopDetails(stop.stop);
          const stopItem = createDiv(
            `${stop.seq}. ${stopDetails?.data?.name_tc || "未知站名"}`,
            [
              "border-b",
              "border-gray-200",
              "p-2",
              "w-full",
              "cursor-pointer",
              "hover:bg-gray-50",
            ]
          );

          // click each stop items
          stopItem.addEventListener("click", async () => {
            stopListDiv
              .querySelectorAll("div")
              .forEach((div) => div.classList.remove("bg-gray-200"));
            stopItem.classList.add("bg-gray-200");

            // fetch ETA data for the selected stop
            const etaData = await fetchETAData(stop.stop, route.route);
            etaDiv.innerHTML = "";
            overlay.classList.remove("hidden");
            etaDiv.classList.remove("hidden");

            // if no ETA data is found
            if (!etaData?.length) {
              etaDiv.innerText = "未能獲取ETA信息，請稍後再試";
              etaDiv.classList.add("text-center", "text-gray-600");
              return;
            }

            etaDiv.append(
              createDiv("預計到達時間", [
                "text-lg",
                "font-bold",
                "text-lime-500",
                "mb-4",
                "text-center",
              ])
            );

            // Ensure all 3 slots are filled if possible
            const etaSlots = Array(3).fill(null);
            etaData.forEach((eta) => {
              if (eta.eta_seq <= 3) etaSlots[eta.eta_seq - 1] = eta;
            });

            etaSlots.forEach((eta, index) => {
              const seq = index + 1;
              const etaItem = createDiv("", [
                "text-lg",
                "text-gray-700",
                "py-2",
                "border-b",
                "border-gray-200",
                "last:border-0",
                "text-center",
              ]);

              if (!eta) {
                etaItem.innerText = `第 ${seq} 班 : 未有預計時間`;
                etaItem.classList.add("text-gray-500");
              } else {
                const realTime = eta.eta
                  ? new Date(eta.eta).toLocaleTimeString()
                  : null;
                const scheduledTime =
                  eta.rmk_tc && eta.rmk_tc.match(/(\d{2}:\d{2})/)
                    ? eta.rmk_tc.match(/(\d{2}:\d{2})/)[0]
                    : realTime || "無原定班次";

                if (seq === 1) {
                  // For eta_seq: 1, prioritize realTime over scheduledTime
                  if (realTime) {
                    const isDelayed =
                      eta.rmk_tc &&
                      eta.rmk_tc !== "原定班次" &&
                      new Date(eta.eta) >
                        new Date().setHours(...scheduledTime.split(":"), 0, 0);
                    etaItem.innerText = isDelayed
                      ? `第 ${seq} 班 (延誤) : 實時: ${realTime} 實時班次`
                      : `第 ${seq} 班 :  ${realTime} 實時班次 `;
                    if (isDelayed) etaItem.classList.add("text-red-500");
                  } else if (
                    scheduledTime !== "無原定班次" &&
                    scheduledTime !== "原定班次"
                  ) {
                    etaItem.innerText = `第 ${seq} 班 : ${scheduledTime} 原定班次`;
                    etaItem.classList.add("text-blue-500");
                  } else {
                    etaItem.innerText = `第 ${seq} 班 : 班次取消`;
                    etaItem.classList.add("text-red-500");
                  }
                } else {
                  // For eta_seq: 2 and 3, prioritize scheduledTime over realTime
                  if (
                    scheduledTime !== "無原定班次" &&
                    scheduledTime !== "原定班次"
                  ) {
                    etaItem.innerText = `第 ${seq} 班 : ${scheduledTime} 原定班次`;
                    etaItem.classList.add("text-blue-500");
                  } else if (realTime) {
                    etaItem.innerText = `第 ${seq} 班 :  ${realTime} 實時班次`;
                  } else {
                    etaItem.innerText = `第 ${seq} 班 : 班次取消`;
                    etaItem.classList.add("text-red-500");
                  }
                }
              }
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

  window.onkeydown = (event) => {
    if (event.keyCode === 13) {
      searchButton.click();
    }
  };

  overlay.addEventListener("click", () => {
    overlay.classList.add("hidden");
    etaDiv.classList.add("hidden");
  });
});
