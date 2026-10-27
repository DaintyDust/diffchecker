import { useEffect } from "react";

type BackgroundModule = {
  init: () => void | Promise<void>;
  destroy?: () => void;
};

function Background() {
  useEffect(() => {
    let disposed = false;
    let activeModule: BackgroundModule | undefined;

    const load = async () => {
      const module: BackgroundModule = await import("./ts/index.ts");

      if (disposed) {
        module.destroy?.();
        return;
      }

      activeModule = module;
      await module.init();
    };

    void load();

    return () => {
      disposed = true;
      activeModule?.destroy?.();
    };
  }, []);

  return null;
}

export default Background;
