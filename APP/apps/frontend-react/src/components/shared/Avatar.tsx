import { useEffect, useState } from 'react';
import { useOptionalAuth } from '../../auth/AuthContext';
import { bearerHeader, BROWSER_COOKIE_CREDENTIAL, fetchApi, resolveApiResourceUrl } from '../../lib/api-core';
import styles from './Avatar.module.css';

interface AvatarProps {
  avatarUrl: string | null | undefined;
  name: string;
  size: number;
  accessToken?: string;
  onClick?: () => void;
  isOnline?: boolean;
  isDnd?: boolean;
}

export function Avatar({ avatarUrl, name, size, accessToken, onClick, isOnline, isDnd }: AvatarProps) {
  const auth = useOptionalAuth();
  const resolvedAccessToken = accessToken ?? (auth ? BROWSER_COOKIE_CREDENTIAL : undefined);
  const [resolvedSrc, setResolvedSrc] = useState(() => (avatarUrl ? resolveApiResourceUrl(avatarUrl) : ''));
  const [failed, setFailed] = useState(false);
  const glyph = (name.trim()[0] || '#').toUpperCase();
  const statusKind = isOnline ? (isDnd ? 'dnd' : 'online') : null;
  const style = {
    width: size,
    height: size,
    borderRadius: size / 2,
    fontSize: size * 0.34,
    cursor: onClick ? 'pointer' : undefined,
  };

  useEffect(() => {
    if (!avatarUrl) {
      setResolvedSrc('');
      setFailed(false);
      return;
    }

    const resolvedUrl = resolveApiResourceUrl(avatarUrl);
    if (!resolvedAccessToken) {
      setResolvedSrc(resolvedUrl);
      setFailed(false);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;

    setFailed(false);
    setResolvedSrc('');

    void fetchApi(resolvedUrl, {
      headers: bearerHeader(resolvedAccessToken),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Avatar request failed (${response.status}).`);
        }
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.warn('Avatar load failed:', error);
          setFailed(true);
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [avatarUrl, resolvedAccessToken]);

  const showImage = Boolean(avatarUrl && resolvedSrc && !failed);

  if (!showImage) {
    return (
      <div className={styles.container}>
        <div
          className={styles.glyph}
          style={style}
          onClick={onClick}
          title={onClick ? '点击更换头像' : undefined}
        >
          {glyph}
        </div>
        {statusKind ? <span className={isDnd ? styles.dndDot : styles.onlineDot} data-status-kind={statusKind} /> : null}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <img
        className={styles.image}
        src={resolvedSrc}
        alt={name}
        style={style}
        onClick={onClick}
        title={onClick ? '点击更换头像' : undefined}
        onError={() => setFailed(true)}
      />
      {statusKind ? <span className={isDnd ? styles.dndDot : styles.onlineDot} data-status-kind={statusKind} /> : null}
    </div>
  );
}
