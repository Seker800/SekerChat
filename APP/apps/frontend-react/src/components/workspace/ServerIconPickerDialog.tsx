import { renderToStaticMarkup } from 'react-dom/server';
import {
  IconPalette as Palette,
  IconBrush as Brush,
  IconPaint as Paintbrush,
  IconVector as PenTool,
  IconPencil as Pencil,
  IconLayersSelected as Layers,
  IconShape as Shapes,
  IconPhoto as ImageIcon,
  IconLibraryPhoto as Images,
  IconCamera as Camera,
  IconVideo as Video,
  IconMovie as Film,
  IconFrame as Frame,
  IconScanEye as ScanEye,
  IconEye as Eye,
  IconSparkles as Sparkles,
  IconWand as WandSparkles,
  IconFlame as Flame,
  IconBolt as Zap,
  IconDroplets as Droplets,
  IconWaveSine as Waves,
  IconSun as Sun,
  IconMoon as Moon,
  IconCloud as Cloud,
  IconCloudRain as CloudRain,
  IconSnowflake as Snowflake,
  IconLeaf as Leaf,
  IconFlower as Flower2,
  IconMountain as Mountain,
  IconMap as Map,
  IconMapPinCheck as MapPinned,
  IconMapPin as MapPin,
  IconRoute as Route,
  IconRouteScan as Waypoints,
  IconNavigation as Navigation,
  IconCompass as Compass,
  IconBuildingCastle as Castle,
  IconBuilding as Building2,
  IconBuildingMonument as Landmark,
  IconHome as Home,
  IconDeviceGamepad2 as Gamepad2,
  IconDice as Dices,
  IconPuzzle as Puzzle,
  IconSwords as Swords,
  IconSword as Sword,
  IconShield as Shield,
  IconShieldCheck as ShieldCheck,
  IconSkull as Skull,
  IconGhost as Ghost,
  IconDiamond as Gem,
  IconDiamond as Diamond,
  IconPackage as Package,
  IconPackages as Boxes,
  IconArchive as Archive,
  IconFolderCheck as FolderKanban,
  IconFolderOpen as FolderOpen,
  IconCircleCheck as BadgeCheck,
  IconCircleCheck as CircleCheck,
  IconClipboardCheck as ClipboardCheck,
  IconChecklist as ListChecks,
  IconFileCheck as FileCheck,
  IconFileText as FileText,
  IconBook as BookOpen,
  IconBug as Bug,
  IconScan as Scan,
  IconSearch as Search,
  IconTarget as Target,
  IconCrosshair as Crosshair,
  IconRocket as Rocket,
  IconFlag as Flag,
  IconTrophy as Trophy,
  IconCrown as Crown,
  IconStar as Star,
  IconHeart as Heart,
  IconThumbUp as ThumbsUp,
  IconUsersGroup as UsersRound,
  IconUser as UserRound,
  IconMessages as MessagesSquare,
  IconMessage2 as MessageSquareText,
  IconSpeakerphone as Megaphone,
  IconHandClick as Handshake,
  IconHammer as Hammer,
  IconTools as Wrench,
  IconSettings as Settings,
  IconAdjustmentsHorizontal as SlidersHorizontal,
  IconComponents as Component,
  IconBlocks as Blocks,
  IconChartArrows as Workflow,
  IconGitBranch as GitBranch,
  IconCode as Code,
  IconTerminal as Terminal,
  IconCpu as Cpu,
  IconDatabase as Database,
  IconServer as Server,
  IconNetwork as Network,
  IconRobot as Bot,
  IconBrain as BrainCircuit,
  IconFlask as FlaskConical,
  IconBulb as Lightbulb,
} from '@tabler/icons-react';
import type { IconProps } from '@tabler/icons-react';
import { useMemo, useState, type ComponentType } from 'react';
import styles from './ServerIconPickerDialog.module.css';

type IconComponent = ComponentType<IconProps>;

function ChineseKnotIcon({ color = 'currentColor', size = 24, stroke = 1.75, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2.5v2.5" />
      <path d="M8.5 5.5h7" />
      <path d="M7 8l5 4 5-4" />
      <path d="M7 16l5-4 5 4" />
      <path d="M8 8v8" />
      <path d="M16 8v8" />
      <path d="M9 18l3 3 3-3" />
    </svg>
  );
}

function HandgunIcon({ color = 'currentColor', size = 24, stroke = 1.75, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 11.5h8.5l3-2.5H20v4H8.5L7 17H4z" />
      <path d="M11 13v5" />
      <path d="M11 18h2.5" />
      <path d="M6.5 11.5v2.5" />
    </svg>
  );
}

interface ServerIconPickerDialogProps {
  serverName: string;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (blob: Blob) => Promise<void> | void;
}

interface ServerIconOption {
  id: string;
  label: string;
  keywords: string;
  Icon: IconComponent;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const ICON_OPTIONS: ServerIconOption[] = [
  { id: 'chinese-knot', label: 'Chinese Knot', keywords: '中国结 中式 节庆 东方 chinese knot ornament', Icon: ChineseKnotIcon },
  { id: 'handgun', label: 'Handgun', keywords: '手枪 枪 武器 射击 handgun pistol gun weapon', Icon: HandgunIcon },
  { id: 'palette', label: 'Palette', keywords: '概念 概念设计 美术 art concept color', Icon: Palette },
  { id: 'brush', label: 'Brush', keywords: '笔刷 绘画 原画 美术 brush paint', Icon: Brush },
  { id: 'paintbrush', label: 'Paintbrush', keywords: '画笔 美术 插画 paint illustration texture brush vertical', Icon: Paintbrush },
  { id: 'pen-tool', label: 'Pen Tool', keywords: '矢量 UI 图标 pen vector', Icon: PenTool },
  { id: 'pencil', label: 'Pencil', keywords: '草图 sketch 线稿 pencil', Icon: Pencil },
  { id: 'layers', label: 'Layers', keywords: '图层 分层 PSD layers', Icon: Layers },
  { id: 'shapes', label: 'Shapes', keywords: '形状 UI 设计 shapes', Icon: Shapes },
  { id: 'image', label: 'Image', keywords: '图片 贴图 素材 asset image', Icon: ImageIcon },
  { id: 'images', label: 'Images', keywords: '图集 参考 素材库 images reference', Icon: Images },
  { id: 'camera', label: 'Camera', keywords: '镜头 截图 参考 camera screenshot', Icon: Camera },
  { id: 'video', label: 'Video', keywords: '视频 录屏 动效 video', Icon: Video },
  { id: 'film', label: 'Film', keywords: '影片 分镜 cinematic film movie clapperboard cutscene slate', Icon: Film },
  { id: 'frame', label: 'Frame', keywords: '画框 构图 frame composition', Icon: Frame },
  { id: 'scan-eye', label: 'Scan Eye', keywords: '审核 视觉 检查 review eye', Icon: ScanEye },
  { id: 'eye', label: 'Eye', keywords: '预览 观察 visual eye', Icon: Eye },
  { id: 'sparkles', label: 'Sparkles', keywords: '特效 魔法 VFX sparkle effects', Icon: Sparkles },
  { id: 'wand-sparkles', label: 'Wand Sparkles', keywords: '魔法 特效 技能 magic vfx', Icon: WandSparkles },
  { id: 'flame', label: 'Flame', keywords: '火焰 特效 fire vfx', Icon: Flame },
  { id: 'zap', label: 'Zap', keywords: '闪电 特效 电击 skill vfx', Icon: Zap },
  { id: 'droplets', label: 'Droplets', keywords: '水 水滴 特效 liquid', Icon: Droplets },
  { id: 'waves', label: 'Waves', keywords: '水面 海浪 场景 waves', Icon: Waves },
  { id: 'sun', label: 'Sun', keywords: '阳光 灯光 lighting sun', Icon: Sun },
  { id: 'moon', label: 'Moon', keywords: '夜晚 灯光 moon', Icon: Moon },
  { id: 'cloud', label: 'Cloud', keywords: '云 天空 场景 cloud', Icon: Cloud },
  { id: 'cloud-rain', label: 'Cloud Rain', keywords: '雨 天气 场景 weather', Icon: CloudRain },
  { id: 'snowflake', label: 'Snowflake', keywords: '雪 冰 特效 weather', Icon: Snowflake },
  { id: 'leaf', label: 'Leaf', keywords: '植物 自然 leaf foliage', Icon: Leaf },
  { id: 'flower', label: 'Flower', keywords: '花 植被 自然 flower', Icon: Flower2 },
  { id: 'mountain', label: 'Mountain', keywords: '场景 山 地形 environment landscape', Icon: Mountain },
  { id: 'map', label: 'Map', keywords: '地图 场景 关卡 map level', Icon: Map },
  { id: 'map-pinned', label: 'Map Pinned', keywords: '地图 点位 关卡 location', Icon: MapPinned },
  { id: 'map-pin', label: 'Map Pin', keywords: '定位 场景 点位 pin', Icon: MapPin },
  { id: 'route', label: 'Route', keywords: '路线 关卡 流程 route', Icon: Route },
  { id: 'waypoints', label: 'Waypoints', keywords: '路径 节点 关卡 waypoints', Icon: Waypoints },
  { id: 'navigation', label: 'Navigation', keywords: '导航 方向 nav', Icon: Navigation },
  { id: 'compass', label: 'Compass', keywords: '指南 方向 世界观 compass', Icon: Compass },
  { id: 'castle', label: 'Castle', keywords: '城堡 建筑 场景 fantasy', Icon: Castle },
  { id: 'building', label: 'Building', keywords: '建筑 场景 城市 building', Icon: Building2 },
  { id: 'landmark', label: 'Landmark', keywords: '地标 建筑 场景 landmark', Icon: Landmark },
  { id: 'home', label: 'Home', keywords: '房屋 建筑 home', Icon: Home },
  { id: 'gamepad', label: 'Gamepad', keywords: '游戏 game 游戏项目', Icon: Gamepad2 },
  { id: 'dices', label: 'Dices', keywords: '随机 玩法 dice game', Icon: Dices },
  { id: 'puzzle', label: 'Puzzle', keywords: '模块 玩法 puzzle design', Icon: Puzzle },
  { id: 'swords', label: 'Swords', keywords: '战斗 武器 combat weapon', Icon: Swords },
  { id: 'sword', label: 'Sword', keywords: '武器 剑 weapon sword', Icon: Sword },
  { id: 'shield', label: 'Shield', keywords: '盾 防御 装备 shield', Icon: Shield },
  { id: 'shield-check', label: 'Shield Check', keywords: '防御 审核 安全 shield', Icon: ShieldCheck },
  { id: 'skull', label: 'Skull', keywords: '怪物 敌人 boss skull monster', Icon: Skull },
  { id: 'ghost', label: 'Ghost', keywords: '怪物 幽灵 enemy ghost', Icon: Ghost },
  { id: 'gem', label: 'Gem', keywords: '宝石 道具 奖励 gem item diamond rare', Icon: Gem },
  { id: 'package', label: 'Package', keywords: '道具 资产 包 package item', Icon: Package },
  { id: 'boxes', label: 'Boxes', keywords: '资产库 道具 批量 asset library', Icon: Boxes },
  { id: 'archive', label: 'Archive', keywords: '归档 archive old', Icon: Archive },
  { id: 'folder-kanban', label: 'Kanban', keywords: '项目 看板 任务 project task', Icon: FolderKanban },
  { id: 'folder-open', label: 'Folder Open', keywords: '项目 文件夹 folder project', Icon: FolderOpen },
  { id: 'badge-check', label: 'Badge Check', keywords: '审核 通过 review approved done confirm circle check', Icon: BadgeCheck },
  { id: 'clipboard-check', label: 'Clipboard Check', keywords: '审核 清单 checklist review', Icon: ClipboardCheck },
  { id: 'list-checks', label: 'List Checks', keywords: '检查 QA checklist', Icon: ListChecks },
  { id: 'file-check', label: 'File Check', keywords: '文件 审核 交付 file review', Icon: FileCheck },
  { id: 'file-text', label: 'File Text', keywords: '文档 需求 说明 docs spec', Icon: FileText },
  { id: 'book-open', label: 'Book Open', keywords: '设定 文档 世界观 lore docs', Icon: BookOpen },
  { id: 'bug', label: 'Bug', keywords: 'bug 问题 修复 QA', Icon: Bug },
  { id: 'scan', label: 'Scan', keywords: '扫描 检查 QA scan', Icon: Scan },
  { id: 'target', label: 'Target', keywords: '目标 战斗 命中 target', Icon: Target },
  { id: 'crosshair', label: 'Crosshair', keywords: '准星 射击 combat aim', Icon: Crosshair },
  { id: 'rocket', label: 'Rocket', keywords: '发布 里程碑 launch release', Icon: Rocket },
  { id: 'flag', label: 'Flag', keywords: '里程碑 flag milestone', Icon: Flag },
  { id: 'trophy', label: 'Trophy', keywords: '奖杯 成就 trophy', Icon: Trophy },
  { id: 'crown', label: 'Crown', keywords: '主项目 重点 VIP crown', Icon: Crown },
  { id: 'star', label: 'Star', keywords: '重点 收藏 star favorite', Icon: Star },
  { id: 'heart', label: 'Heart', keywords: '喜欢 情绪 heart', Icon: Heart },
  { id: 'thumbs-up', label: 'Thumbs Up', keywords: '认可 反馈 approve like', Icon: ThumbsUp },
  { id: 'users', label: 'Users', keywords: '团队 team group', Icon: UsersRound },
  { id: 'user', label: 'User', keywords: '角色 人物 角色设计 character user', Icon: UserRound },
  { id: 'messages', label: 'Messages', keywords: '沟通 反馈 chat feedback', Icon: MessagesSquare },
  { id: 'message', label: 'Message', keywords: '聊天 评论 comment message', Icon: MessageSquareText },
  { id: 'megaphone', label: 'Megaphone', keywords: '公告 通知 announcement', Icon: Megaphone },
  { id: 'handshake', label: 'Handshake', keywords: '客户 合作 外包 handshake client', Icon: Handshake },
  { id: 'hammer', label: 'Hammer', keywords: '制作 工具 build tools', Icon: Hammer },
  { id: 'wrench', label: 'Wrench', keywords: '工具 修复 pipeline tools', Icon: Wrench },
  { id: 'settings', label: 'Settings', keywords: '设置 配置 config', Icon: Settings },
  { id: 'sliders', label: 'Sliders', keywords: '参数 调整 tuning', Icon: SlidersHorizontal },
  { id: 'component', label: 'Component', keywords: '组件 prefab component', Icon: Component },
  { id: 'blocks', label: 'Blocks', keywords: '模块 block asset', Icon: Blocks },
  { id: 'workflow', label: 'Workflow', keywords: '流程 管线 pipeline workflow', Icon: Workflow },
  { id: 'git-branch', label: 'Git Branch', keywords: '版本 分支 git version', Icon: GitBranch },
  { id: 'code', label: 'Code', keywords: '代码 程序 dev code', Icon: Code },
  { id: 'terminal', label: 'Terminal', keywords: '命令 工具 cli terminal', Icon: Terminal },
  { id: 'cpu', label: 'CPU', keywords: '技术 TA 性能 hardware', Icon: Cpu },
  { id: 'database', label: 'Database', keywords: '数据 database assets', Icon: Database },
  { id: 'server', label: 'Server', keywords: '服务器 backend infra', Icon: Server },
  { id: 'network', label: 'Network', keywords: '网络 联机 service', Icon: Network },
  { id: 'bot', label: 'Bot', keywords: '机器人 AI bot agent', Icon: Bot },
  { id: 'brain', label: 'AI Brain', keywords: 'AI 智能 生成 model', Icon: BrainCircuit },
  { id: 'flask', label: 'Flask', keywords: '实验 原型 prototype lab', Icon: FlaskConical },
  { id: 'lightbulb', label: 'Lightbulb', keywords: '想法 创意 idea', Icon: Lightbulb },
];

const BACKGROUND_COLORS = ['#000000', '#1f6feb', '#2ea043', '#d29922', '#db6d28', '#bf3989', '#6f42c1', '#238636', '#24292f'];
const ICON_COLORS = ['#ffffff', '#f6f8fa', '#e3f2fd', '#fff8c5', '#ffeef8', '#f0fff4'];

function buildAvatarSvg(Icon: IconComponent, backgroundColor: string, iconColor: string, serverName: string): string {
  const iconMarkup = renderToStaticMarkup(
    <Icon color={iconColor} size={128} stroke={1.75} aria-hidden="true" />,
  );

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">',
    `<title>${escapeSvgText(serverName)}</title>`,
    `<circle cx="128" cy="128" r="128" fill="${backgroundColor}"/>`,
    `<svg x="64" y="64" width="128" height="128">${iconMarkup}</svg>`,
    '</svg>',
  ].join('');
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');

  if (!context || typeof canvas.toBlob !== 'function') {
    throw new Error('当前浏览器不支持生成图标。');
  }

  const image = new Image();
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return new Promise((resolve, reject) => {
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('生成图标失败。'));
        }
      }, 'image/png');
    };
    image.onerror = () => reject(new Error('生成图标失败。'));
    image.src = source;
  });
}

export function ServerIconPickerDialog({ serverName, isSaving, onCancel, onSave }: ServerIconPickerDialogProps) {
  const [query, setQuery] = useState('');
  const [selectedIconId, setSelectedIconId] = useState(ICON_OPTIONS[0]!.id);
  const [backgroundColor, setBackgroundColor] = useState(BACKGROUND_COLORS[0]!);
  const [iconColor, setIconColor] = useState(ICON_COLORS[0]!);
  const [error, setError] = useState('');

  const filteredIcons = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return ICON_OPTIONS;
    return ICON_OPTIONS.filter((option) => `${option.label} ${option.keywords}`.toLowerCase().includes(normalizedQuery));
  }, [query]);

  const selectedIcon = ICON_OPTIONS.find((option) => option.id === selectedIconId) ?? ICON_OPTIONS[0]!;
  const PreviewIcon = selectedIcon.Icon;

  const handleSave = async () => {
    setError('');
    try {
      const svg = buildAvatarSvg(selectedIcon.Icon, backgroundColor, iconColor, serverName);
      await onSave(await svgToPngBlob(svg));
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成图标失败。');
    }
  };

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="选择 server 图标" onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h3>选择 server 图标</h3>
            <p>从内置极简图标库选择图标，并生成可继续自定义替换的 server 头像。</p>
          </div>
          <button className={styles.closeButton} type="button" onClick={onCancel} aria-label="关闭">×</button>
        </div>

        <div className={styles.body}>
          <section className={styles.previewCard}>
            <div className={styles.preview} style={{ backgroundColor }}>
              <PreviewIcon color={iconColor} size={72} stroke={1.75} />
            </div>
            <div className={styles.previewCopy}>
              <strong>{serverName}</strong>
              <span>{selectedIcon.label}</span>
            </div>
          </section>

          <label className={styles.searchField}>
            <span>搜索图标</span>
            <div>
              <Search size={16} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="code, ai, 设计, 数据..." />
            </div>
          </label>

          <div className={styles.swatchGroup} aria-label="背景色">
            {BACKGROUND_COLORS.map((color) => (
              <button
                key={color}
                className={backgroundColor === color ? styles.swatchActive : styles.swatch}
                type="button"
                style={{ backgroundColor: color }}
                aria-label={`背景色 ${color}`}
                onClick={() => setBackgroundColor(color)}
              />
            ))}
          </div>

          <div className={styles.swatchGroup} aria-label="图标色">
            {ICON_COLORS.map((color) => (
              <button
                key={color}
                className={iconColor === color ? styles.swatchActive : styles.swatch}
                type="button"
                style={{ backgroundColor: color }}
                aria-label={`图标色 ${color}`}
                onClick={() => setIconColor(color)}
              />
            ))}
          </div>

          <div className={styles.iconGrid} role="list" aria-label="图标列表">
            {filteredIcons.map((option) => {
              const Icon = option.Icon;
              return (
                <button
                  key={option.id}
                  className={selectedIconId === option.id ? styles.iconButtonActive : styles.iconButton}
                  type="button"
                  onClick={() => setSelectedIconId(option.id)}
                  aria-label={`选择 ${option.label} 图标`}
                >
                  <Icon size={22} aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          {filteredIcons.length === 0 ? <p className={styles.empty}>没有匹配的图标。</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>

        <div className={styles.footer}>
          <button className={styles.ghostButton} type="button" onClick={onCancel}>取消</button>
          <button className={styles.primaryButton} type="button" disabled={isSaving} onClick={handleSave}>
            {isSaving ? '保存中...' : '保存图标'}
          </button>
        </div>
      </div>
    </div>
  );
}
