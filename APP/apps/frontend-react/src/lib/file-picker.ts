type PickerAcceptOption = {
  description: string;
  accept: Record<string, string[]>;
};

type OpenFilePickerOptions = {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: PickerAcceptOption[];
};

type FilePickerWindow = Window & typeof globalThis & {
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<Array<{ getFile: () => Promise<File> }>>;
};

function pickWithInput(multiple: boolean): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    input.style.position = 'fixed';
    input.style.top = '-100px';
    input.style.left = '-100px';
    input.style.visibility = 'hidden';

    const cleanup = () => {
      input.remove();
      window.removeEventListener('focus', onFocus);
    };

    const onFocus = () => {
      // The file dialog closed; if no files were selected, resolve null
      setTimeout(() => {
        if (!input.files || input.files.length === 0) {
          cleanup();
          resolve(null);
        }
      }, 300);
    };

    input.onchange = () => {
      cleanup();
      const files = input.files ? Array.from(input.files) : [];
      resolve(files.length ? files : null);
    };

    window.addEventListener('focus', onFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickAnyFiles(options: {
  multiple?: boolean;
} = {}): Promise<File[] | null> {
  const pickerWindow = window as FilePickerWindow;
  const multiple = options.multiple ?? true;

  if (typeof pickerWindow.showOpenFilePicker === 'function') {
    try {
      const handles = await pickerWindow.showOpenFilePicker({
        multiple,
        excludeAcceptAllOption: false,
      });
      return await Promise.all(handles.map((handle) => handle.getFile()));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }
      // Fall through to input fallback on unexpected errors
    }
  }

  return pickWithInput(multiple);
}
