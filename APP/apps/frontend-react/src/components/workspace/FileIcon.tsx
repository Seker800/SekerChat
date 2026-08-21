import {
  si7zip,
  siAutodesk,
  siAutodeskmaya,
  siBlender,
  siCinema4d,
  siFigma,
  siGimp,
  siHoudini,
  siKrita,
  siNuke,
  siUnity,
  siUnrealengine,
} from 'simple-icons';

interface FileIconProps {
  filename: string;
  size?: number;
}

/** Brand icons from simple-icons, keyed by lower-case file extension */
const branded: Record<string, string> = {
  blend: siBlender.path,
  zip: si7zip.path,
  rar: si7zip.path,
  '7z': si7zip.path,
  tar: si7zip.path,
  gz: si7zip.path,
  max: siAutodesk.path,
  ma: siAutodeskmaya.path,
  mb: siAutodeskmaya.path,
  c4d: siCinema4d.path,
  hip: siHoudini.path,
  hda: siHoudini.path,
  nk: siNuke.path,
  fbx: siAutodesk.path,
  unitypackage: siUnity.path,
  uasset: siUnrealengine.path,
  umap: siUnrealengine.path,
  fig: siFigma.path,
  kra: siKrita.path,
  xcf: siGimp.path,
};

export function FileIcon({ filename, size = 20 }: FileIconProps) {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot + 1).toUpperCase() : '';

  // Brand icon from simple-icons
  const brandPath = branded[ext.toLowerCase()];
  if (brandPath) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={brandPath} />
      </svg>
    );
  }

  // Fallback: extension badge
  if (!ext) {
    // No extension at all — generic file icon
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M6.5 2H14l5 5v13.5H6.5V2zM13 3H8v17h8.5V8H13V3zm1 1.5l2 2H14v-2zM9.5 12h5v1.5h-5V12zm0 3h5v1.5h-5V15z" />
      </svg>
    );
  }

  // Truncate long extensions
  const label = ext.length > 4 ? ext.slice(0, 4) : ext;
  const fontSize = label.length <= 3 ? 9 : label.length === 4 ? 7.5 : 6.5;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="20" height="18" rx="3" fill="currentColor" opacity="0.12" />
      <rect x="2" y="3" width="20" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill="currentColor"
        fontSize={fontSize}
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
      >
        {label}
      </text>
    </svg>
  );
}
