import React, { PropsWithChildren, useCallback, useEffect, useState } from "react";

import { DefaultMetrics, DEFAULT_TIMEOUT } from "../lib/constants";
import { InstantBanditProps, LoadState, TimerLike } from "../lib/types";
import { InstantBanditContext, createBanditContext } from "../lib/contexts";
import { exists, isBrowserEnvironment, useIsomorphicLayoutEffect } from "../lib/utils";
import { DEFAULT_SITE } from "../lib/defaults";


/**
 * Enables Instant Bandit in your apps and websites.
 */
const InstantBanditComponent = (props: PropsWithChildren<InstantBanditProps>) => {

  const [ready, setReady] = useState(false);
  const [loadState, setLoadState] = useState({
    renders: 0,
    recordedExposure: false,
    state: LoadState.PRELOAD,
    loadTimeStart: new Date().getTime(),
    loadTimeEnd: 0,
    loadDuration: 0,
    loadTimedOut: false,
    loadTimeoutTimer: null as null | TimerLike,
  });

  const [ctx, setBanditState] = useState(() => {
    const { options: config, siteName } = props || {};
    const ctx = createBanditContext(config);
    const { loader } = ctx;

    // Hook to switch variants on the fly for debugging
    ctx.select = async (variant) => {
      try {
        const site = await loader.load(ctx, siteName, typeof variant === "string" ? variant : variant?.name);
        setBanditState({ ...ctx });
        return site;
      } catch (err) {
        handleError(err, ctx);
        console.warn(`[IB] Error loading site: ${err}`);
        return DEFAULT_SITE;
      }
    };

    return ctx as InstantBanditContext;
  });

  const {
    defer,
    select,
    site: siteProp,
    siteName,
    timeout: propsTimeout,
    onError,
    onReady,
  } = props;
  const { loader, metrics, session } = ctx;
  const timeout = exists(propsTimeout) ? propsTimeout : DEFAULT_TIMEOUT;

  // Rather than setting state as soon as we are ready, we defer it to the layout effect.
  const readyCallback = useCallback(() => {
    if (loadState.state === LoadState.READY) {
      return;
    }

    loadState.state = LoadState.READY;

    // Give the layoutEffect the go ahead, that's where we'll set our main state
    // and kick off any layout changes, render, and we'll repaint more effectively.
    setReady(true);

    if (onReady) {
      try {
        onReady(ctx);
      } catch (err) {
        console.warn(`[IB] An error occurred while handling a ready event: ${err}`);
      }
    }
  }, [loadState, onReady, ctx]);

  // Flush any queued metrics
  const flush = useCallback(() => {
    try {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("onvisibilitychange", flush);
    } finally {
      metrics.flush(ctx, true).catch(() => void 0);
    }
  }, [ctx, metrics]);

  function broadcastReadyState() {
    readyCallback();
  }

  function markVariantPresented(ctx: InstantBanditContext) {
    if (!isBrowserEnvironment || loadState.recordedExposure === true) {
      return;
    }
    const { experiment, variant } = ctx;

    try {
      session.persistVariant(ctx, experiment.id, variant.name);
    } catch (err) {
      console.warn(`[IB] Session not saved`);
    }

    // Track the exposure
    metrics.sinkEvent(ctx, DefaultMetrics.EXPOSURES);
    loadState.recordedExposure = true;
  }

  function handleError(err: Error | null = null, ib?: InstantBanditContext) {
    if (!err) {
      return;
    }

    console.warn(`[IB] Component received error: ${err}`);

    if (onError) {
      try {
        onError(err, ib);
      } catch (err) {
        console.warn(`[IB] Additional error received invoking error handler: ${err}`);
      }
    }
  }


  const timeoutCallback = useCallback(() => {
    if (loadState.state === LoadState.READY) {
      return;
    }

    loadState.loadTimedOut = true;
    loadState.loadTimeEnd = new Date().getTime();
    loadState.loadDuration = loadState.loadTimeEnd - loadState.loadTimeStart;

    return () => clearTimeout(loadState.loadTimeoutTimer as NodeJS.Timeout);
  }, [loadState]);


  // Kick off site loading ASAP
  if (loader && loadState.state === LoadState.PRELOAD) {

    // Note: Not calling setState for internal state. Prevents unwanted renders aka flicker
    loadState.state = LoadState.WAIT;

    // Note: In order to load in SSR without flicker, we must initialize *synchronously*.
    if (siteProp) {
      loader.init(ctx, siteProp, select);
      setLoadState({ ...loadState, state: LoadState.READY });
      markVariantPresented(ctx);
      broadcastReadyState();
      if (loader.error) {
        handleError(loader.error, ctx);
      }
    } else {
      if (!exists(loadState.loadTimeoutTimer) && exists(timeout)) {
        loadState.loadTimeoutTimer = setTimeout(timeoutCallback, timeout);
      }

      loader.load(ctx, siteName, select)
        .then(() => {
          if (loadState.loadTimedOut) {
            ctx.init(DEFAULT_SITE);
            markVariantPresented(ctx);
            setLoadState({ ...loadState });
            broadcastReadyState();
            throw new Error(`[IB] Timed out waiting for site @ ${loadState.loadDuration} ms.`);
          }
        })

        // This will invoke a layout effect, which will do our primary state update in
        .then(() => markVariantPresented(ctx))
        .then(() => setLoadState({ ...loadState, state: LoadState.READY }))
        .then(broadcastReadyState)
        .then(() => loader.error ? handleError(loader.error, ctx) : void 0)
        .catch(err => handleError(err, ctx));
    }
  }

  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    document.addEventListener("onvisibilitychange", flush);
    return flush;
  }, [flush]);

  // This state change happens synchronously before the next paint.
  // Arranging our state changes in order to do our biggest one here reduces flicker immensely.
  useIsomorphicLayoutEffect(() => {
    if (ready) {
      setBanditState(ctx);
    }
  }, []);

  // Skip the hydration render.
  // This decouples browser selection from full SSR selection and de-risks against rehydration
  // errors in general.
  if (defer === true && loadState.renders === 0) {
    ++loadState.renders;
    setTimeout(() => setLoadState({ ...loadState }));
    return (
      <></>
    );
  }
  return (
    <InstantBanditContext.Provider value={ctx}>
      {ready && props.children}
    </InstantBanditContext.Provider>
  );
};

export { InstantBanditComponent, InstantBanditComponent as InstantBandit };
