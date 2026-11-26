import { useEffect, useRef, useState } from 'react';
import { useOptionalAuth } from '../../auth/AuthContext';
import { BROWSER_COOKIE_CREDENTIAL, resolveApiResourceUrl } from '../../lib/api-core';
import { acquireAvatar, getCachedAvatar, type AvatarLease } from './avatarCache';
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

export function Avatar({
  avatarUrl,
  name,
  size,
  accessToken,
  onClick,
  isOnline,
  isDnd,
}: AvatarProps) {
  const auth = useOptionalAuth();
  const resolvedAccessToken = accessToken ?? (auth ? BROWSER_COOKIE_CREDENTIAL : undefined);
  const [resolvedSrc, setResolvedSrc] = useState(() => {
    if (!avatarUrl) return '';
    const resolvedUrl = resolveApiResourceUrl(avatarUrl);
    if (!resolvedAccessToken) return resolvedUrl;
    return getCachedAvatar(resolvedUrl, resolvedAccessToken) ?? '';
  });
  const [failed, setFailed] = useState(false);
  const leaseRef = useRef<AvatarLease | null>(null);
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
      leaseRef.current?.release();
      leaseRef.current = null;
      setResolvedSrc('');
      setFailed(false);
      return;
    }

    const resolvedUrl = resolveApiResourceUrl(avatarUrl);
    if (!resolvedAccessToken) {
      leaseRef.current?.release();
      leaseRef.current = null;
      setResolvedSrc(resolvedUrl);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setFailed(false);
    setResolvedSrc(getCachedAvatar(resolvedUrl, resolvedAccessToken) ?? '');

    void acquireAvatar(resolvedUrl, resolvedAccessToken)
      .then((lease) => {
        if (cancelled) {
          lease.release();
          return;
        }
        leaseRef.current?.release();
        leaseRef.current = lease;
        setResolvedSrc(lease.src);
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('Avatar load failed:', error);
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      leaseRef.current?.release();
      leaseRef.current = null;
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
        {statusKind ? (
          <span
            className={isDnd ? styles.dndDot : styles.onlineDot}
            data-status-kind={statusKind}
          />
        ) : null}
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
      {statusKind ? (
        <span className={isDnd ? styles.dndDot : styles.onlineDot} data-status-kind={statusKind} />
      ) : null}
    </div>
  );
}
