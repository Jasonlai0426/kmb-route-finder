1. Route List Data

https://data.etabus.gov.hk/v1/transport/kmb/route

("route": "1A",
"bound": "O",
"orig_tc": "中秀茂坪",,
"dest_tc": "尖沙咀碼頭")

("route": "1A",
"bound": "I",
"orig_tc": "尖沙咀碼頭",
"dest_tc": "中秀茂坪")

2. Stop List Data

fetch stopData
https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${mappedBound}/${direction}

fetch stopName
https://data.etabus.gov.hk/v1/transport/kmb/stop/${stopId}

("stop": "18492910339410B1", "name_tc": "竹園邨總站",
"data_timestamp": "2020-11-29T11:40:00+08:00")

3. ETA Data

https://data.etabus.gov.hk/v1/transport/kmb/eta/{stop_id}/{route}/{service_type}

"eta_seq": 1,
"eta": "2025-03-26T14:31:44+08:00",

"eta_seq": 2,
"eta": "2025-03-26T14:40:34+08:00",

"eta_seq": 3,
"eta": "2025-03-26T14:43:45+08:00",

"data_timestamp": "2022-11-
29T15:44:33+08:00"

4. Route ETA Data
   https://data.etabus.gov.hk/v1/transport/kmb/route-eta/{route}/{service_type}

"eta_seq": 1,
"eta": "2025-03-26T14:52:00+08:00",
"rmk_tc": "原定班次",
