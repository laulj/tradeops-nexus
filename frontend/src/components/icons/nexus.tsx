// ── Nexus icon set ─────────────────────────────────────────────────────────
// Centralised mapping over lucide-react so the app chrome, menu and metric tiles
// all share one thin-stroke (1.75px) line style — the landing page's language.
// Swapping the icon library later means editing only this file.
import React from "react"
import {
    Activity,
    ArrowRightLeft,
    ArrowUpRight,
    Bot,
    CalendarDays,
    ChartColumn,
    CircleDollarSign,
    Crosshair,
    Database,
    Download,
    Gauge,
    Layers,
    LayoutDashboard,
    LoaderCircle,
    LogOut,
    Mail,
    Moon,
    RefreshCw,
    Search,
    ServerCog,
    Settings,
    Sun,
    TrendingUp,
    Upload,
    Users,
    Wallet,
    Zap,
} from "lucide-react"

type IconComponent = React.ComponentType<{
    size?: number
    strokeWidth?: number
    className?: string
    style?: React.CSSProperties
    "aria-hidden"?: boolean
}>

export interface NexusIconProps {
    size?: number
    strokeWidth?: number
    className?: string
    style?: React.CSSProperties
    "aria-hidden"?: boolean
}

const make = (Icon: IconComponent): React.FC<NexusIconProps> =>
    function NexusIcon({ size = 16, strokeWidth = 1.75, ...rest }) {
        return <Icon size={size} strokeWidth={strokeWidth} {...rest} />
    }

// ── Navigation ──────────────────────────────────────────────────────────────
export const OverviewIcon = make(LayoutDashboard)
export const ChartsIcon = make(ChartColumn)
export const DataIcon = make(Database)
export const FundingRateIcon = make(Activity)
export const PositionIcon = make(Layers)
export const ProfitIcon = make(TrendingUp)
export const BalanceIcon = make(Wallet)
export const SettingsIcon = make(Settings)
export const SystemIcon = make(ServerCog)
export const UsersIcon = make(Users)

// ── Metric tiles ────────────────────────────────────────────────────────────
export const TotalValueIcon = make(CircleDollarSign)
export const UpSinceIcon = make(TrendingUp)
export const UpTodayIcon = make(ArrowUpRight)
export const TradesIcon = make(Zap)

// ── Actions / misc ──────────────────────────────────────────────────────────
export const LogoutIcon = make(LogOut)
export const SunIcon = make(Sun)
export const MoonIcon = make(Moon)
export const SpinnerIcon = make(LoaderCircle)
export const ExportIcon = make(Download)
export const RefreshIcon = make(RefreshCw)
export const UploadIcon = make(Upload)
export const BotIcon = make(Bot)
export const SearchIcon = make(Search)
export const CalendarIcon = make(CalendarDays)
export const PairsIcon = make(ArrowRightLeft)
export const GaugeIcon = make(Gauge)
export const CrosshairIcon = make(Crosshair)
export const MailIcon = make(Mail)
export const ArrowUpRightIcon = make(ArrowUpRight)
