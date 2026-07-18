import { useState, useEffect } from "react";

// The browser's own online flag is optimistic: it reports "online" when
// there is a connection to the router, not when requests are actually
// getting through. So this also listens for a signal the app sends when
// a real request fails on the network, which is the case that matters on
// patchy mobile data.
export function useOnline() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine !== false
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);

    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener("ycdi:network-lost", down);
    window.addEventListener("ycdi:network-ok", up);

    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.removeEventListener("ycdi:network-lost", down);
      window.removeEventListener("ycdi:network-ok", up);
    };
  }, []);

  return online;
}

export function signalNetworkLost() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ycdi:network-lost"));
}

export function signalNetworkOk() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ycdi:network-ok"));
}
