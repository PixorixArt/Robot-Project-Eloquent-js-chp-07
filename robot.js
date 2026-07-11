/* =====================================================================
   MEADOWBROOK PARCEL POST
   A robot delivery simulation, modelled on "A Robot" (Eloquent
   JavaScript, 4th ed., Chapter 7). Every core algorithm from that
   chapter is implemented below: buildGraph, roadGraph, VillageState,
   move(), randomRobot, routeRobot, findRoute (BFS), goalOrientedRobot,
   and compareRobots — plus a bonus lazyRobot and a full animated UI.
   ===================================================================== */

(() => {
  "use strict";

  /* ===================================================================
     1. THE VILLAGE MAP DATA
     Each location has a percentage-based (x, y) position on a
     0-600 x 0-400 canvas. Because the map stage keeps a fixed
     aspect-ratio (3:2) at every screen size, these coordinates line
     up perfectly on phones, tablets and desktops alike.
     =================================================================== */

  const LOCATIONS = {
    "Alice's House": { x: 190, y: 90,  icon: "🏠" },
    "Bob's House":   { x: 340, y: 90,  icon: "🏡" },
    "Cabin":         { x: 110, y: 100, icon: "🛖" },
    "Post Office":   { x: 70,  y: 195, icon: "🏤" },
    "Town Hall":     { x: 340, y: 215, icon: "🏛️" },
    "Daria's House": { x: 460, y: 130, icon: "🏠" },
    "Ernie's House": { x: 500, y: 235, icon: "🏡" },
    "Farm":          { x: 400, y: 325, icon: "🌾" },
    "Grete's House": { x: 290, y: 335, icon: "🏠" },
    "Shop":          { x: 215, y: 265, icon: "🏪" },
    "Marketplace":   { x: 175, y: 215, icon: "🏬" }
  };

  // The road network, written as "A-B" pairs — identical in spirit to
  // the roads array from Eloquent JavaScript Chapter 7.
  const ROADS = [
    "Alice's House-Bob's House",
    "Alice's House-Cabin",
    "Alice's House-Post Office",
    "Bob's House-Town Hall",
    "Daria's House-Ernie's House",
    "Daria's House-Town Hall",
    "Ernie's House-Farm",
    "Ernie's House-Grete's House",
    "Grete's House-Farm",
    "Grete's House-Shop",
    "Marketplace-Farm",
    "Marketplace-Post Office",
    "Marketplace-Shop",
    "Marketplace-Town Hall",
    "Shop-Town Hall"
  ];

  /* ===================================================================
     2. buildGraph — turns the flat "A-B" road list into an adjacency
     map, e.g. { "Alice's House": ["Bob's House", "Cabin", ...], ... }.
     Roads are two-way, so each edge is added in both directions.
     =================================================================== */
  function buildGraph(edges) {
    const graph = Object.create(null);
    function addEdge(from, to) {
      if (graph[from] == null) graph[from] = [];
      if (!graph[from].includes(to)) graph[from].push(to);
    }
    for (const edge of edges) {
      const [from, to] = edge.split("-");
      addEdge(from, to);
      addEdge(to, from);
    }
    return graph;
  }

  const roadGraph = buildGraph(ROADS);

  /* ===================================================================
     3. VillageState — an immutable snapshot of the world: where the
     robot is, and where every parcel currently is / needs to go.
     =================================================================== */
  class VillageState {
    constructor(place, parcels) {
      this.place = place;     // name of the robot's current location
      this.parcels = parcels; // array of {id, place, address}
    }

    /**
     * move(destination) — the heart of the simulation.
     * Returns a brand-new VillageState with the robot at `destination`,
     * *only* if a road actually connects the current place to it
     * (this is what guarantees the robot never cuts across the map).
     * Any parcel sitting at the robot's current location travels
     * along with it; any parcel that has now reached its address is
     * considered delivered and removed from the list.
     */
    move(destination) {
      if (!roadGraph[this.place].includes(destination)) {
        return this; // no road there — the robot simply can't go
      }
      const parcels = this.parcels
        .map(p => {
          if (p.place !== this.place) return p;          // not with the robot
          return { id: p.id, place: destination, address: p.address };
        })
        .filter(p => p.place !== p.address);              // drop delivered ones
      return new VillageState(destination, parcels);
    }

    /** Creates a random starting scenario with `count` parcels. */
    static random(count = 5) {
      const places = Object.keys(roadGraph);
      const parcels = [];
      for (let i = 0; i < count; i++) {
        const address = randomPick(places);
        let place;
        do {
          place = randomPick(places);
        } while (place === address); // pickup and delivery must differ
        parcels.push({ id: `parcel-${i}-${Math.random().toString(36).slice(2, 7)}`, place, address });
      }
      return new VillageState("Post Office", parcels);
    }
  }

  /** Picks a random element from an array. */
  function randomPick(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  /* ===================================================================
     4. findRoute — breadth-first search (BFS).
     Explores the map one road-hop at a time, guaranteeing the very
     first time we reach `to` we've found a *shortest* route to it.
     Returns an array of place names describing the path to walk.
     =================================================================== */
  function findRoute(graph, from, to) {
    const work = [{ at: from, route: [] }];
    for (let i = 0; i < work.length; i++) {
      const { at, route } = work[i];
      for (const place of graph[at]) {
        if (place === to) return route.concat(place);
        if (!work.some(w => w.at === place)) {
          work.push({ at: place, route: route.concat(place) });
        }
      }
    }
    return []; // should not happen on a connected graph
  }

  /* ===================================================================
     5. ROBOT STRATEGIES
     Every strategy has the same shape: (state, memory) -> {direction, memory}
     `direction` is the next place to move to; `memory` is whatever the
     robot wants to remember for its next turn.
     `missionInfo` is set purely for the UI, so the info panel can
     explain *why* the robot is heading where it's heading.
     =================================================================== */

  let missionInfo = { type: "idle", target: null };

  // ---- Random Robot: picks any reachable road at random. ----
  function randomRobot(state) {
    missionInfo = { type: "random", target: null };
    return { direction: randomPick(roadGraph[state.place]) };
  }

  // ---- Route Robot: loops forever around one fixed, hand-picked tour. ----
  const FIXED_MAIL_ROUTE = [
    "Alice's House", "Cabin", "Alice's House", "Bob's House",
    "Town Hall", "Daria's House", "Ernie's House",
    "Grete's House", "Shop", "Grete's House", "Farm",
    "Marketplace", "Post Office"
  ];

  function routeRobot(state, memory) {
    if (!memory || memory.length === 0) memory = FIXED_MAIL_ROUTE;
    missionInfo = { type: "route", target: memory[0] };
    return { direction: memory[0], memory: memory.slice(1) };
  }

  // ---- Goal-Oriented Robot: always beelines (via BFS) toward the ----
  // ---- very first parcel in its list — pick it up, then deliver it. ----
  function goalOrientedRobot(state, route) {
    if (!route || route.length === 0) {
      const parcel = state.parcels[0];
      if (parcel.place !== state.place) {
        route = findRoute(roadGraph, state.place, parcel.place);
        missionInfo = { type: "pickup", target: parcel.place };
      } else {
        route = findRoute(roadGraph, state.place, parcel.address);
        missionInfo = { type: "deliver", target: parcel.address };
      }
    }
    return { direction: route[0], memory: route.slice(1) };
  }

  // ---- Lazy Robot: instead of always chasing parcel #0, it looks at
  // ---- every parcel, works out the route for each, and prefers a
  // ---- short route that lets it pick a new parcel up along the way. ----
  function lazyRobot(state, route) {
    if (!route || route.length === 0) {
      const options = state.parcels.map(parcel => {
        if (parcel.place !== state.place) {
          return { route: findRoute(roadGraph, state.place, parcel.place), pickUp: true, target: parcel.place };
        }
        return { route: findRoute(roadGraph, state.place, parcel.address), pickUp: false, target: parcel.address };
      });
      // Score = prefer routes that pick up a parcel, then prefer the shortest.
      function score(option) {
        return (option.pickUp ? 0.5 : 0) - option.route.length;
      }
      const best = options.reduce((a, b) => (score(a) > score(b) ? a : b));
      route = best.route;
      missionInfo = { type: best.pickUp ? "pickup" : "deliver", target: best.target };
    }
    return { direction: route[0], memory: route.slice(1) };
  }

  const ROBOTS = {
    random: { fn: randomRobot, label: "Random Robot", initMemory: null },
    route:  { fn: routeRobot,  label: "Route Robot",  initMemory: [] },
    goal:   { fn: goalOrientedRobot, label: "Goal-Oriented Robot", initMemory: [] },
    lazy:   { fn: lazyRobot,   label: "Lazy Robot",   initMemory: [] }
  };

  /* ===================================================================
     6. runRobotSteps / compareRobots — measuring performance.
     runRobotSteps silently plays out a full delivery run (no
     animation) and returns how many turns it took.
     compareRobots reuses the exact same random tasks for every
     strategy so the comparison is fair, exactly as in the book.
     =================================================================== */
  function runRobotSteps(startState, robotFn, initMemory, maxSteps = 1000) {
    let state = startState;
    let memory = initMemory;
    let steps = 0;
    while (state.parcels.length > 0 && steps < maxSteps) {
      const action = robotFn(state, memory);
      state = state.move(action.direction);
      memory = action.memory;
      steps++;
    }
    return steps;
  }

  function compareRobots(taskCount = 100) {
    // Build one shared batch of random tasks so every robot faces
    // identical delivery jobs.
    const tasks = [];
    for (let i = 0; i < taskCount; i++) tasks.push(VillageState.random(5));

    const results = {};
    for (const key of Object.keys(ROBOTS)) {
      const { fn, initMemory } = ROBOTS[key];
      let total = 0;
      for (const task of tasks) {
        total += runRobotSteps(task, fn, initMemory);
      }
      results[key] = total / tasks.length;
    }
    return results;
  }

  /* ===================================================================
     7. DOM REFERENCES
     =================================================================== */
  const roadSvg        = document.getElementById("roadSvg");
  const locationLayer  = document.getElementById("locationLayer");
  const robotMarker    = document.getElementById("robotMarker");
  const robotBadge     = document.getElementById("robotParcelBadge");
  const mapStage       = document.getElementById("mapStage");

  const robotTypeSelect = document.getElementById("robotType");
  const btnStart  = document.getElementById("btnStart");
  const btnPause  = document.getElementById("btnPause");
  const btnReset  = document.getElementById("btnReset");
  const btnSpeed  = document.getElementById("btnSpeed");
  const btnCompare = document.getElementById("btnCompare");

  const infoRobot        = document.getElementById("infoRobot");
  const infoLocation     = document.getElementById("infoLocation");
  const infoMission      = document.getElementById("infoMission");
  const infoParcelStatus = document.getElementById("infoParcelStatus");
  const infoDelivered    = document.getElementById("infoDelivered");
  const infoRemaining    = document.getElementById("infoRemaining");
  const infoSteps        = document.getElementById("infoSteps");
  const infoRoute        = document.getElementById("infoRoute");
  const infoStatus       = document.getElementById("infoStatus");

  const parcelList  = document.getElementById("parcelList");
  const parcelCount = document.getElementById("parcelCount");

  const statAvgTurns   = document.getElementById("statAvgTurns");
  const statEfficiency = document.getElementById("statEfficiency");
  const statCompleted  = document.getElementById("statCompleted");
  const statRemaining  = document.getElementById("statRemaining");
  const compareResults = document.getElementById("compareResults");

  /* ===================================================================
     8. BUILD THE STATIC MAP (roads + location markers) — runs once.
     =================================================================== */
  function buildMap() {
    // Draw every unique road exactly once as a dashed SVG line.
    const seen = new Set();
    for (const edge of ROADS) {
      const [a, b] = edge.split("-");
      const key = [a, b].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", LOCATIONS[a].x);
      line.setAttribute("y1", LOCATIONS[a].y);
      line.setAttribute("x2", LOCATIONS[b].x);
      line.setAttribute("y2", LOCATIONS[b].y);
      line.setAttribute("class", "road-line");
      line.dataset.pair = key;
      roadSvg.appendChild(line);
    }

    // Place a marker + label for every location.
    for (const name of Object.keys(LOCATIONS)) {
      const loc = LOCATIONS[name];
      const marker = document.createElement("div");
      marker.className = "location-marker";
      marker.style.left = (loc.x / 6) + "%";   // x is 0-600  -> 0-100%
      marker.style.top  = (loc.y / 4) + "%";   // y is 0-400  -> 0-100%
      marker.dataset.name = name;
      marker.innerHTML = `
        <div class="location-dot">${loc.icon}<span class="location-parcel-flag" hidden>📦</span></div>
        <div class="location-name">${name}</div>
      `;
      locationLayer.appendChild(marker);
    }
  }

  /** Highlights the road between two adjacent places (visual polish only). */
  function highlightRoad(a, b) {
    if (!a || !b) return;
    const key = [a, b].sort().join("|");
    document.querySelectorAll(".road-line").forEach(line => {
      line.classList.toggle("active", line.dataset.pair === key);
    });
  }

  /** Spawns a short-lived emoji burst (pickup / delivery feedback) at a location. */
  function spawnBurst(placeName, emoji) {
    const loc = LOCATIONS[placeName];
    const burst = document.createElement("div");
    burst.className = "fx-burst";
    burst.textContent = emoji;
    burst.style.left = (loc.x / 6) + "%";
    burst.style.top  = (loc.y / 4) + "%";
    mapStage.appendChild(burst);
    burst.addEventListener("animationend", () => burst.remove());
  }

  /* ===================================================================
     9. SIMULATION CONTROLLER
     Owns the live VillageState and drives the animated, turn-by-turn
     run that the person watches in the browser.
     =================================================================== */
  const sim = {
    state: null,
    robotKey: "goal",
    memory: null,
    carriedIds: new Set(),
    steps: 0,
    delivered: 0,
    initialParcelCount: 0,
    running: false,
    started: false,
    fast: false,
    timerId: null
  };

  const BASE_TICK_MS = 900;

  function currentRobot() {
    return ROBOTS[sim.robotKey];
  }

  /** Resets everything to a brand new random delivery scenario. */
  function resetSimulation() {
    stopTimer();
    sim.state = VillageState.random(5);
    sim.memory = currentRobot().initMemory;
    sim.carriedIds = new Set();
    sim.steps = 0;
    sim.delivered = 0;
    sim.initialParcelCount = sim.state.parcels.length;
    sim.running = false;
    sim.started = false;
    missionInfo = { type: "idle", target: null };

    document.getElementById("mcBanner")?.remove();
    placeRobotInstantly(sim.state.place);
    render();
    setButtonsForIdle();
  }

  /** One simulated turn: ask the robot for a move, apply it, animate it. */
  function tick() {
    if (sim.state.parcels.length === 0) {
      finishMission();
      return;
    }

    const fromPlace = sim.state.place;

    // Detect pickups: parcels waiting exactly where the robot stands
    // right now, that it isn't already carrying.
    for (const parcel of sim.state.parcels) {
      if (parcel.place === fromPlace && !sim.carriedIds.has(parcel.id)) {
        sim.carriedIds.add(parcel.id);
        spawnBurst(fromPlace, "📦");
      }
    }

    const { fn } = currentRobot();
    const action = fn(sim.state, sim.memory);
    const nextState = sim.state.move(action.direction);
    sim.memory = action.memory;

    // Detect deliveries: parcels that existed before the move but not after.
    const deliveredNow = sim.state.parcels.filter(
      p => !nextState.parcels.some(np => np.id === p.id)
    );
    for (const parcel of deliveredNow) {
      sim.carriedIds.delete(parcel.id);
      sim.delivered++;
      spawnBurst(parcel.address, "✅");
    }

    sim.steps++;
    sim.state = nextState;

    highlightRoad(fromPlace, sim.state.place);
    animateRobotTo(sim.state.place);
    render();

    if (sim.state.parcels.length === 0) {
      // give the final move's animation time to finish before celebrating
      setTimeout(finishMission, 750);
    }
  }

  function finishMission() {
    stopTimer();
    sim.running = false;
    setButtonsForComplete();
    render();
    showMissionCompleteBanner();
  }

  function showMissionCompleteBanner() {
    let banner = document.getElementById("mcBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "mcBanner";
      banner.className = "mission-complete-banner";
      banner.innerHTML = `<span>🎉 All parcels delivered in ${sim.steps} steps!</span>`;
      mapStage.appendChild(banner);
      requestAnimationFrame(() => banner.classList.add("show"));
    }
  }

  function startTimer() {
    stopTimer();
    const delay = sim.fast ? BASE_TICK_MS / 2 : BASE_TICK_MS;
    sim.timerId = setInterval(tick, delay);
  }
  function stopTimer() {
    if (sim.timerId) clearInterval(sim.timerId);
    sim.timerId = null;
  }

  /* ---- robot marker positioning & animation ---- */
  function placeRobotInstantly(placeName) {
    const loc = LOCATIONS[placeName];
    robotMarker.style.transition = "none";
    robotMarker.style.left = (loc.x / 6) + "%";
    robotMarker.style.top  = (loc.y / 4) + "%";
    // force reflow so the transition re-enables cleanly next time
    void robotMarker.offsetWidth;
    robotMarker.style.transition = "";
  }

  function animateRobotTo(placeName) {
    const loc = LOCATIONS[placeName];
    robotMarker.classList.add("is-moving");
    robotMarker.style.left = (loc.x / 6) + "%";
    robotMarker.style.top  = (loc.y / 4) + "%";
    setTimeout(() => robotMarker.classList.remove("is-moving"), 700);
  }

  /* ===================================================================
     10. RENDERING — reflect sim state into the DOM every tick.
     =================================================================== */
  function render() {
    const { state, delivered, steps } = sim;
    const remaining = state.parcels.length;

    // ---- info panel ----
    infoRobot.textContent = currentRobot().label;
    infoLocation.textContent = state.place;
    infoMission.textContent = missionText();
    infoParcelStatus.textContent = remaining === 0
      ? "No parcels left to deliver"
      : `Carrying ${sim.carriedIds.size} of ${remaining} pending parcel${remaining === 1 ? "" : "s"}`;
    infoDelivered.textContent = delivered;
    infoRemaining.textContent = remaining;
    infoSteps.textContent = steps;
    infoRoute.textContent = routeText();
    infoStatus.innerHTML = statusPill();

    // ---- parcel list ----
    renderParcelList();

    // ---- location markers: active / target / has-parcel ----
    document.querySelectorAll(".location-marker").forEach(marker => {
      const name = marker.dataset.name;
      marker.classList.toggle("is-active", name === state.place);
      marker.classList.toggle("is-target", missionInfo.target === name && remaining > 0);
      const hasWaitingParcel = state.parcels.some(p => p.place === name && !sim.carriedIds.has(p.id));
      marker.querySelector(".location-parcel-flag").hidden = !hasWaitingParcel;
    });

    // ---- robot badge ----
    const newBadge = String(sim.carriedIds.size);
    if (robotBadge.textContent !== newBadge) {
      robotBadge.textContent = newBadge;
      robotBadge.classList.remove("bump");
      void robotBadge.offsetWidth;
      robotBadge.classList.add("bump");
    }

    // ---- live stats ----
    statCompleted.textContent = delivered;
    statRemaining.textContent = remaining;
    statAvgTurns.textContent = delivered > 0 ? (steps / delivered).toFixed(1) : "—";
    statEfficiency.textContent = steps > 0 ? Math.round((delivered / steps) * 100) + "%" : "—";
  }

  function missionText() {
    if (sim.state.parcels.length === 0) return "All parcels delivered! 🎉";
    if (!sim.started) return "Waiting to start…";
    switch (missionInfo.type) {
      case "pickup":  return `Heading to pick up a parcel at ${missionInfo.target}`;
      case "deliver": return `Delivering a parcel to ${missionInfo.target}`;
      case "route":   return `Following the fixed mail route toward ${missionInfo.target}`;
      case "random":  return "Wandering the village at random";
      default:        return "Waiting to start…";
    }
  }

  function routeText() {
    if (sim.robotKey === "goal" || sim.robotKey === "lazy") {
      if (!sim.memory || sim.memory.length === 0) return missionInfo.target ? missionInfo.target : "—";
      return [...sim.memory].join(" → ");
    }
    if (sim.robotKey === "route") {
      return sim.memory && sim.memory.length ? sim.memory.slice(0, 5).join(" → ") : "restarting loop…";
    }
    return "unpredictable (random walk)";
  }

  function statusPill() {
    if (sim.state.parcels.length === 0) {
      return `<span class="status-pill status-complete">Mission Complete</span>`;
    }
    if (sim.running) return `<span class="status-pill status-running">Running</span>`;
    if (sim.started) return `<span class="status-pill status-paused">Paused</span>`;
    return `<span class="status-pill status-idle">Idle</span>`;
  }

  function renderParcelList() {
    parcelCount.textContent = `(${sim.state.parcels.length})`;
    parcelList.innerHTML = "";
    if (sim.state.parcels.length === 0) {
      parcelList.innerHTML = `<li class="parcel-empty">All parcels have been delivered 🎉</li>`;
      return;
    }
    for (const parcel of sim.state.parcels) {
      const carrying = sim.carriedIds.has(parcel.id);
      const li = document.createElement("li");
      li.className = "parcel-item";
      li.innerHTML = `
        <span class="icon">📦</span>
        <span class="route">${parcel.place} → ${parcel.address}</span>
        <span class="badge ${carrying ? "badge-carrying" : "badge-waiting"}">${carrying ? "WITH ROBOT" : "WAITING"}</span>
      `;
      parcelList.appendChild(li);
    }
  }

  /* ===================================================================
     11. BUTTON STATE HELPERS
     =================================================================== */
  function setButtonsForRunning() {
    btnStart.disabled = true;
    btnPause.disabled = false;
    robotTypeSelect.disabled = true;
  }
  function setButtonsForPaused() {
    btnStart.disabled = false;
    btnStart.textContent = "▶ Resume";
    btnPause.disabled = true;
    robotTypeSelect.disabled = false;
  }
  function setButtonsForIdle() {
    btnStart.disabled = false;
    btnStart.textContent = "▶ Start";
    btnPause.disabled = true;
    robotTypeSelect.disabled = false;
  }
  function setButtonsForComplete() {
    btnStart.disabled = true;
    btnPause.disabled = true;
    robotTypeSelect.disabled = false;
  }

  /* ===================================================================
     12. EVENT WIRING
     =================================================================== */
  btnStart.addEventListener("click", () => {
    if (sim.state.parcels.length === 0) return;
    sim.started = true;
    sim.running = true;
    startTimer();
    setButtonsForRunning();
    render();
  });

  btnPause.addEventListener("click", () => {
    sim.running = false;
    stopTimer();
    setButtonsForPaused();
    render();
  });

  btnReset.addEventListener("click", resetSimulation);

  btnSpeed.addEventListener("click", () => {
    sim.fast = !sim.fast;
    btnSpeed.setAttribute("aria-pressed", String(sim.fast));
    btnSpeed.textContent = sim.fast ? "×1 Speed" : "×2 Speed";
    if (sim.running) startTimer(); // apply new speed immediately
  });

  robotTypeSelect.addEventListener("change", () => {
    sim.robotKey = robotTypeSelect.value;
    sim.memory = currentRobot().initMemory;
    missionInfo = { type: "idle", target: null };
    render();
  });

  btnCompare.addEventListener("click", () => {
    btnCompare.disabled = true;
    btnCompare.textContent = "Running 100 simulated tasks…";
    // Let the browser paint the "running" label before the (synchronous,
    // but fast) benchmark blocks the main thread.
    setTimeout(() => {
      const results = compareRobots(100);
      renderCompareResults(results);
      btnCompare.disabled = false;
      btnCompare.textContent = "Compare All Robots (100 runs)";
    }, 30);
  });

  function renderCompareResults(results) {
    const best = Object.keys(results).reduce((a, b) => (results[a] < results[b] ? a : b));
    compareResults.hidden = false;
    compareResults.innerHTML = Object.keys(ROBOTS).map(key => `
      <div class="compare-row">
        <span>${ROBOTS[key].label}${key === best ? " 🏆" : ""}</span>
        <span>${results[key].toFixed(1)} turns/task</span>
      </div>
    `).join("");
  }

  /* ===================================================================
     13. INIT
     =================================================================== */
  buildMap();
  resetSimulation();
})();