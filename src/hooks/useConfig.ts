import { useEffect, useState } from "react"
import { deepAssign, extract } from "../utils/utils"
import { Settings } from "../utils/settings"

export const useConfig = <S extends Settings, K extends keyof S>(settings: S, keys: Array<K>) => {
	type Config = Pick<typeof settings, K>

	const [conf, setConf] = useState<Config>(() => extract(settings, [...keys]) as Config)

	useEffect(() => {
		deepAssign(settings, conf as Record<string, any>)
	}, [conf])

	const update = <Key extends keyof Config>(key: Key, value: Config[Key]) => {
		setConf(prev => ({ ...prev, [key]: value }))
	}

	const reset = () => {
		const defaultConf = deepAssign(conf, settings.getReference()!, { extend: false, clone: true }) as Config
		setConf(defaultConf)
	}

	return { conf, setConf, update, reset }
}