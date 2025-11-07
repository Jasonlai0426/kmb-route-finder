// Fetch route data
async function fetchRouteData() {
  const url = "https://data.etabus.gov.hk/v1/transport/kmb/route";
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      attempts++;
      console.log(`Attempt ${attempts} failed to fetch route data:`, error);
      if (attempts === maxAttempts) {
        console.error("Max attempts reached. Failed to fetch route data.");
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return null;
}

// Fetch stop data for a route
async function fetchStopData(route, bound) {
  const mappedBound = bound === "O" ? "outbound" : "inbound";
  const direction = mappedBound === "outbound" ? "1" : "2";
  const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${mappedBound}/${direction}`;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`
        );
      }
      const data = await response.json();
      const stops = data.data || [];
      // Deduplicate stops by both seq and stopId
      const uniqueStops = [];
      const seenKeys = new Set();
      for (const stop of stops) {
        const key = `${stop.seq}-${stop.stop}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueStops.push(stop);
        } else {
          console.warn(
            `Duplicate stop found for seq ${stop.seq}, stopId ${stop.stop}:`,
            stop
          );
        }
      }
      console.log(`Unique stops for route ${route}:`, uniqueStops);
      return uniqueStops;
    } catch (error) {
      attempts++;
      console.log(
        `Attempt ${attempts} failed to fetch stop data for route ${route} (${mappedBound}) with direction ${direction}:`,
        error
      );
      if (attempts === maxAttempts) {
        console.error(`Max attempts reached for route ${route}.`);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return null;
}

// Fetch stop details with retry logic
async function fetchStopDetails(stopId) {
  const url = `https://data.etabus.gov.hk/v1/transport/kmb/stop/${stopId}`;
  let attempts = 0;
  const maxAttempts = 5; // Increased attempts for Cloudflare issues

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log(`Stop details for stop ${stopId}:`, data);
      return data;
    } catch (error) {
      attempts++;
      console.log(
        `Attempt ${attempts} failed to fetch stop details for stop ${stopId}:`,
        error
      );
      if (attempts === maxAttempts) {
        console.error(`Max attempts reached for stop ${stopId}.`);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Increased delay
    }
  }
  return null;
}

// Fetch ETA data for a stop with retry logic
async function fetchETAData(stopId, route, serviceType = "1") {
  const stopETAUrl = `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopId}/${route}/${serviceType}`;
  let attempts = 0;
  const maxAttempts = 5; // Increased attempts for Cloudflare issues

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(stopETAUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log(`ETA data for stop ${stopId}:`, data);
      const filteredData = (data.data || []).filter(
        (eta) => eta.eta_seq >= 1 && eta.eta_seq <= 3
      );

      if (filteredData.length < 3) {
        const altServiceTypes = ["2", "3", "4"];
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
      return filteredData.sort((a, b) => a.eta_seq - b.eta_seq);
    } catch (error) {
      attempts++;
      console.error(
        `Attempt ${attempts} failed to fetch ETA for stop ${stopId}:`,
        error
      );
      if (attempts === maxAttempts) {
        console.error(`Max attempts reached for stop ${stopId}.`);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Increased delay
    }
  }
  return null;
}

// Main logic
document.addEventListener("DOMContentLoaded", async () => {
  const routeDiv = document.getElementById("route");
  const stopListDiv = document.getElementById("stopList");
  const etaDiv = document.getElementById("eta");
  const overlay = document.getElementById("overlay");
  let searchInput = document.querySelector("input");
  let searchButton = document.querySelector("button");

  console.log("Search button:", searchButton);
  console.log("Search input:", searchInput);

  if (!searchButton || !searchInput) {
    console.error("Search button or input not found initially. Retrying...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    searchInput = document.querySelector("input");
    searchButton = document.querySelector("button");
    console.log("Retry - Search button:", searchButton);
    console.log("Retry - Search input:", searchInput);
  }

  if (!searchButton) {
    console.error("Search button not found in the DOM!");
    return;
  }

  if (!searchInput) {
    console.error("Search input not found in the DOM!");
    return;
  }

  const routeData = await fetchRouteData();
  console.log("Route data fetched:", routeData);
  if (!routeData?.data) {
    routeDiv.innerText = "無法載入路線數據，請稍後再試";
    console.error("Failed to load route data, exiting.");
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

  // Flag to prevent multiple initial clicks
  let hasTriggeredInitialClick = false;

  const attachSearchListener = () => {
    // Remove any existing listeners to prevent duplicates
    searchButton.removeEventListener("click", searchButton._listener);
    const searchHandler = async () => {
      console.log("Search button clicked!");
      const inputRoute = searchInput.value.trim().toUpperCase();
      console.log("Input route:", inputRoute);
      if (!inputRoute) {
        console.log("No input route provided.");
        routeDiv.innerText = "請輸入有效路線號碼";
        return clearDisplay();
      }

      const routes = routeData.data.filter((item) => item.route === inputRoute);
      console.log("Filtered routes:", routes);
      if (!routes.length) {
        console.log("No matching routes found.");
        routeDiv.innerText = "找不到該路線";
        return clearDisplay();
      }

      clearDisplay();
      routeDiv.classList.add("gap-2");

      routes.forEach((route, index) => {
        const routeOption = createDiv(`${route.orig_tc} → ${route.dest_tc}`, [
          "cursor-pointer",
          "p-2",
          "rounded-lg",
          "border",
          "border-gray-300",
          "hover:bg-gray-100",
        ]);

        routeOption.addEventListener("click", async () => {
          console.log(
            `Route option clicked: ${route.orig_tc} → ${route.dest_tc}`
          );
          routeDiv
            .querySelectorAll("div")
            .forEach((div) => div.classList.remove("bg-gray-200", "scale-105"));
          routeOption.classList.add("bg-gray-200", "scale-105");

          const stops = await fetchStopData(route.route, route.bound);
          stopListDiv.innerHTML = etaDiv.innerHTML = "";
          etaDiv.classList.add("hidden");
          overlay.classList.add("hidden");

          if (!stops || !stops.length) {
            stopListDiv.innerText = "未能獲取站點信息";
            return;
          }

          for (const stop of stops) {
            if (!stop.stop) {
              console.error(`Invalid stopId for stop ${stop.seq}:`, stop);
              const stopItem = createDiv(
                `${stop.seq}. 無效站點 (Invalid Stop)`,
                ["border-b", "border-gray-200", "p-2", "w-full", "text-red-500"]
              );
              stopListDiv.append(stopItem);
              continue;
            }

            const stopDetails = await fetchStopDetails(stop.stop);
            const stopName = (stopDetails?.data?.name_tc || "").trim();
            const displayName = stopName !== "" ? stopName : "未知站名";
            const stopItem = createDiv(`${stop.seq}. ${displayName}`, [
              "border-b",
              "border-gray-200",
              "p-2",
              "w-full",
              "cursor-pointer",
              "hover:bg-gray-50",
            ]);

            console.log(
              `Created stop item: ${stop.seq}. ${displayName}, stopId: ${stop.stop}`
            );

            stopItem.addEventListener("click", async () => {
              console.log(`Clicked stop: ${stop.seq}, stopId: ${stop.stop}`);
              stopListDiv
                .querySelectorAll("div")
                .forEach((div) => div.classList.remove("bg-gray-200"));
              stopItem.classList.add("bg-gray-200");

              etaDiv.innerHTML = "";
              overlay.classList.remove("hidden");
              etaDiv.classList.remove("hidden");

              if (stop.seq === 1 && route.bound === "O") {
                const etaData = await fetchETAData(stop.stop, route.route);
                if (!etaData || etaData.length === 0) {
                  etaDiv.innerText = "此站為起點站，未能提供預計到達時間";
                  etaDiv.classList.add("text-center", "text-gray-600");
                  return;
                }
              }

              const etaData = await fetchETAData(stop.stop, route.route);
              if (!etaData?.length) {
                etaDiv.innerText = `未能獲取ETA信息 (站點: ${displayName})，請稍後再試`;
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
                    if (realTime) {
                      const isDelayed =
                        eta.rmk_tc &&
                        eta.rmk_tc !== "原定班次" &&
                        new Date(eta.eta) >
                          new Date().setHours(
                            ...scheduledTime.split(":"),
                            0,
                            0
                          );
                      etaItem.innerText = isDelayed
                        ? `第 ${seq} 班 (延誤) : 實時: ${realTime} 實時班次`
                        : `第 ${seq} 班 : ${realTime} 實時班次`;
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
                    if (
                      scheduledTime !== "無原定班次" &&
                      scheduledTime !== "原定班次"
                    ) {
                      etaItem.innerText = `第 ${seq} 班 : ${scheduledTime} 原定班次`;
                      etaItem.classList.add("text-blue-500");
                    } else if (realTime) {
                      etaItem.innerText = `第 ${seq} 班 : ${realTime} 實時班次`;
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
          }
        });

        routeDiv.append(routeOption);
        // Trigger the first route option only once
        if (index === 0 && !hasTriggeredInitialClick) {
          hasTriggeredInitialClick = true;
          setTimeout(() => {
            console.log("Triggering initial route option click");
            routeOption.click();
          }, 100);
        }
      });
    };
    searchButton._listener = searchHandler;
    searchButton.addEventListener("click", searchHandler);
  };

  // Call attachSearchListener only once
  attachSearchListener();

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
