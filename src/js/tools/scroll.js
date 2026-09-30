// AnEdiKit - Horizontal scroll-card overflow affordances.
export function initScrollCardsOverflow() {
  const container = document.getElementById("executables-scroll-container");
  if (!container) return;
  const wrapper = container.closest(".scroll-cards-wrapper");
  if (!wrapper) return;

  const updateOverflow = () => {
    const scrollLeft = container.scrollLeft;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    if (scrollLeft > 4) {
      wrapper.classList.add("has-overflow-left");
    } else {
      wrapper.classList.remove("has-overflow-left");
    }

    if (maxScroll - scrollLeft > 4) {
      wrapper.classList.add("has-overflow-right");
    } else {
      wrapper.classList.remove("has-overflow-right");
    }
  };

  updateOverflow();
  setTimeout(updateOverflow, 50);
  setTimeout(updateOverflow, 300);

  if (container.dataset.velocityScrollBound === "true") {
    return;
  }
  container.dataset.velocityScrollBound = "true";

  container.addEventListener("scroll", updateOverflow, { passive: true });
  window.addEventListener("resize", updateOverflow);

  // Velocity Momentum, Drag-to-Scroll & Rubberband Overscroll engine
  let isDown = false;
  let startX = 0;
  let scrollStart = 0;
  let hasMoved = false;
  let currentOverscroll = 0;
  let momentumId = 0;
  let activeVelocity = 0;
  let moveHistory = [];

  const stopMomentum = () => {
    if (momentumId) {
      cancelAnimationFrame(momentumId);
      momentumId = 0;
    }
    activeVelocity = 0;
  };

  const getRubberbandOffset = (overDistance) => {
    if (overDistance <= 0) return 0;
    return 1.6 * Math.pow(overDistance, 0.55);
  };

  const resetOverscroll = () => {
    if (currentOverscroll !== 0) {
      currentOverscroll = 0;
      container.style.transition = "transform 0.38s cubic-bezier(0.175, 0.885, 0.32, 1.25)";
      container.style.transform = "translateX(0px)";
      setTimeout(() => {
        if (!isDown && !momentumId) {
          container.style.transition = "";
          updateOverflow();
        }
      }, 380);
    }
  };

  const startMomentum = (v0) => {
    stopMomentum();
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    if (maxScroll <= 0) return;

    // Cap velocity within physical bounds (px/ms)
    let v = Math.max(-3.8, Math.min(3.8, v0));
    activeVelocity = v;
    let lastTick = performance.now();
    const friction = 0.935; // Frame-rate normalized decay

    const step = (now) => {
      const dt = Math.min(32, now - lastTick);
      lastTick = now;

      // Frame-rate independent friction decay
      v *= Math.pow(friction, dt / 16.67);
      activeVelocity = v;

      if (Math.abs(v) < 0.01) {
        stopMomentum();
        updateOverflow();
        return;
      }

      const currMaxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      const delta = v * dt;
      const targetScroll = container.scrollLeft - delta;

      if (targetScroll < 0) {
        container.scrollLeft = 0;
        const over = -targetScroll;
        currentOverscroll = getRubberbandOffset(over + Math.abs(v) * 15);
        container.style.transition = "none";
        container.style.transform = `translateX(${currentOverscroll}px)`;
        stopMomentum();
        updateOverflow();
        setTimeout(resetOverscroll, 30);
        return;
      }

      if (targetScroll > currMaxScroll) {
        container.scrollLeft = currMaxScroll;
        const over = targetScroll - currMaxScroll;
        currentOverscroll = -getRubberbandOffset(over + Math.abs(v) * 15);
        container.style.transition = "none";
        container.style.transform = `translateX(${currentOverscroll}px)`;
        stopMomentum();
        updateOverflow();
        setTimeout(resetOverscroll, 30);
        return;
      }

      container.scrollLeft = targetScroll;
      updateOverflow();
      momentumId = requestAnimationFrame(step);
    };

    momentumId = requestAnimationFrame(step);
  };

  container.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    stopMomentum();
    if (currentOverscroll !== 0) {
      resetOverscroll();
    }
    isDown = true;
    hasMoved = false;
    startX = e.clientX;
    scrollStart = container.scrollLeft;
    moveHistory = [{ x: e.clientX, t: performance.now() }];
    container.style.transition = "none";
    container.classList.add("is-dragging");
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    const now = performance.now();
    moveHistory.push({ x: e.clientX, t: now });
    while (moveHistory.length > 1 && now - moveHistory[0].t > 100) {
      moveHistory.shift();
    }

    const dx = e.clientX - startX;
    if (Math.abs(dx) > 3) {
      hasMoved = true;
    }

    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const targetScroll = scrollStart - dx;

    if (targetScroll < 0) {
      container.scrollLeft = 0;
      const over = -targetScroll;
      currentOverscroll = getRubberbandOffset(over);
      container.style.transform = `translateX(${currentOverscroll}px)`;
      wrapper.classList.remove("has-overflow-left");
      if (maxScroll > 0) wrapper.classList.add("has-overflow-right");
    } else if (targetScroll > maxScroll) {
      container.scrollLeft = maxScroll;
      const over = targetScroll - maxScroll;
      currentOverscroll = -getRubberbandOffset(over);
      container.style.transform = `translateX(${currentOverscroll}px)`;
      wrapper.classList.remove("has-overflow-right");
      if (maxScroll > 0) wrapper.classList.add("has-overflow-left");
    } else {
      container.scrollLeft = targetScroll;
      if (currentOverscroll !== 0) {
        currentOverscroll = 0;
        container.style.transform = "translateX(0px)";
      }
      updateOverflow();
    }
  });

  const handleDragEnd = () => {
    if (!isDown) return;
    isDown = false;
    container.classList.remove("is-dragging");

    if (currentOverscroll !== 0) {
      resetOverscroll();
      return;
    }

    const now = performance.now();
    let releaseVelocity = 0;
    if (moveHistory.length >= 2 && now - moveHistory[moveHistory.length - 1].t <= 70) {
      const recent = moveHistory.filter((p) => now - p.t <= 80);
      const p0 = recent[0] || moveHistory[0];
      const p1 = moveHistory[moveHistory.length - 1];
      const dt = p1.t - p0.t;
      if (dt > 8) {
        releaseVelocity = (p1.x - p0.x) / dt;
      }
    }

    if (Math.abs(releaseVelocity) > 0.05) {
      container.style.transition = "none";
      startMomentum(releaseVelocity);
    } else {
      resetOverscroll();
    }
  };

  window.addEventListener("mouseup", handleDragEnd);
  window.addEventListener("blur", handleDragEnd);

  // Smooth Horizontal Wheel Velocity Scrolling:
  // Intercepts vertical or horizontal wheel events over cards and drives momentum scrolling.
  container.addEventListener(
    "wheel",
    (e) => {
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      if (maxScroll <= 0) return;

      const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!rawDelta) return;

      const canScrollLeft = container.scrollLeft > 0 && rawDelta < 0;
      const canScrollRight = container.scrollLeft < maxScroll && rawDelta > 0;

      if (canScrollLeft || canScrollRight || currentOverscroll !== 0) {
        e.preventDefault();

        let multiplier = 1;
        if (e.deltaMode === 1) multiplier = 24; // DOM_DELTA_LINE
        else if (e.deltaMode === 2) multiplier = 300; // DOM_DELTA_PAGE

        const delta = rawDelta * multiplier;
        // Map delta to an initial impulse: negative delta (scroll down/right) increases scrollLeft
        const impulse = -(delta / 100) * 0.42;

        if (momentumId && Math.sign(activeVelocity) === Math.sign(impulse)) {
          startMomentum(Math.max(-3.8, Math.min(3.8, activeVelocity + impulse * 0.5)));
        } else {
          startMomentum(impulse);
        }
      }
    },
    { passive: false }
  );

  // Prevent accidental clicks on child interactive elements during drag
  container.addEventListener(
    "click",
    (e) => {
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
}
