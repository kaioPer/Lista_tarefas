import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

let active = false;

// Render ordinary HTML controls: embedded browsers can disable prompt/confirm.
function requestDialog(
  title: string,
  textInput: boolean,
  maxLength = 160,
): Promise<string | null> {
  if (active) return Promise.resolve(null);
  active = true;
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const finish = (value: string | null) => {
      resolve(value);
      active = false;
      queueMicrotask(() => {
        root.unmount();
        host.remove();
      });
    };
    function Dialog() {
      const ref = useRef<HTMLDialogElement>(null);
      useEffect(() => {
        ref.current?.showModal();
        return () => ref.current?.close();
      }, []);
      return (
        <dialog
          ref={ref}
          aria-label={title}
          onCancel={(event) => {
            event.preventDefault();
            finish(null);
          }}
        >
          <h2>{title}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = textInput
                ? String(
                    new FormData(event.currentTarget).get("value") ?? "",
                  ).trim()
                : "yes";
              if (value) finish(value);
            }}
          >
            {textInput && (
              <label>
                {title}
                <input name="value" required maxLength={maxLength} autoFocus />
              </label>
            )}
            <div className="row">
              <button type="button" onClick={() => finish(null)}>
                Cancelar
              </button>
              <button className="primary" type="submit">
                {textInput ? "Salvar" : "Confirmar"}
              </button>
            </div>
          </form>
        </dialog>
      );
    }
    root.render(<Dialog />);
  });
}

export const askText = (title: string, maxLength = 160) =>
  requestDialog(title, true, maxLength);
export const askConfirm = async (title: string) =>
  (await requestDialog(title, false)) !== null;
