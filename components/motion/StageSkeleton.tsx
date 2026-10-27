"use client";

import { useEffect, useRef } from "react";
import { onLoad } from "@/lib/loading";
import { whenSiteOpen } from "@/lib/intro";
import Loader from "@/components/ui/Loader";

/**
 * Holds the 3D stage's place until the scene is ready: a ghost staircase with a shimmer
 * running up it, and the house loader. Fades away the moment the climber is loaded.
 */
export default function StageSkeleton() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ready = false;
    let open = false;
    const sync = () => {
      if (root.current) root.current.dataset.state = ready ? "done" : open ? "loading" : "waiting";
    };
    const stopOpen = whenSiteOpen(() => {
      open = true;
      sync();
    });
    const stopLoad = onLoad((s) => {
      ready = s.ready;
      sync();
    });
    return () => {
      stopOpen();
      stopLoad();
    };
  }, []);

  return (
    <div ref={root} className="skeleton" data-state="waiting" aria-hidden="true">
      <div className="skeleton-stair">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="skeleton-tread" style={{ ["--i" as string]: i }} />
        ))}
        <span className="skeleton-figure" />
      </div>
      <div className="skeleton-loader">
        <Loader label="Loading the climb" />
      </div>
    </div>
  );
}
