# Car models

All `q-*.glb` files are Quaternius models, CC0 1.0 (public domain): the Cars Pack (https://quaternius.com/packs/cars.html)
and the Public Transport Pack (https://quaternius.com/packs/publictransport.html).

| File | Quaternius model | Pack |
| --- | --- | --- |
| `q-sports.glb` | SportsCar2 | Cars |
| `q-compact.glb` | NormalCar2 | Cars |
| `q-suv.glb` | SUV | Cars |
| `q-taxi.glb` | Taxi (also the plain sedan, with the roof sign hidden) | Cars |
| `q-police.glb` | Cop | Cars |
| `q-ambulance.glb` | Ambulance | Public Transport |
| `q-bus.glb` | Bus | Public Transport |
| `q-schoolbus.glb` | SchoolBus | Public Transport |

These GLBs are the conversions published by the kids-playground project (github.com/KoheiKasahara/kids-playground,
`public/models/car-builder/`, documented in its `docs/credits.md`): exported from the official .blend files with the
tyres removed and materials renamed by role (Body, Glass, Trim, ...). Axle positions come from that project's
`carVehicles.ts`. The game adds Kenney tyres and rescales every model to real-world size (`CAR_DIMS` in index.html).

The pickup, vans, delivery truck, garbage truck and the tyres in `assets/models/` are from Kenney's Car Kit (CC0).
