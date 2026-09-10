import { createContext } from "react"
import type { Dispatch, SetStateAction } from "react"
import type { MenuTheme } from "antd"

export const ThemeContext = createContext<{
    theme: MenuTheme
    setTheme: Dispatch<SetStateAction<MenuTheme>>
}>({ theme: "light", setTheme: () => {} })

export const UserContext = createContext<{
    isLogin: boolean
    setIsLogin: Dispatch<SetStateAction<boolean>>
    user: string | null
    setUser: Dispatch<SetStateAction<string | null>>
}>({ isLogin: false, setIsLogin: () => {}, user: null, setUser: () => {} })

export const SiderCollapseContext = createContext<{
    siderCollapse: boolean
    setSiderCollapse: Dispatch<SetStateAction<boolean>>
}>({ siderCollapse: false, setSiderCollapse: () => {} })
