import { SCENE_HEIGHT, SCENE_RECT_ATTRS, SCENE_WIDTH } from "../constants";

export const SVG_DEFS = (
	<defs>
		<radialGradient id="hidden-scene-gradient">
			<stop offset="0%" stopColor="#222" />
			<stop offset="60%" stopColor="#111" />
			<stop offset="95%" stopColor="black" />
		</radialGradient>
		<clipPath id="fc-scene-clip">
			<rect {...SCENE_RECT_ATTRS} rx={SCENE_HEIGHT/14} />
		</clipPath>
		<rect 
			id="fc-scene-box" 
			{...SCENE_RECT_ATTRS} 
			rx={SCENE_HEIGHT/14} 
			fill="var(--active-connection)"
		/>
		<symbol id="fc-scene-hidden" overflow="visible">
			<rect {...SCENE_RECT_ATTRS} rx={SCENE_HEIGHT/10} fill="url(#hidden-scene-gradient)" />
			<path d={`M${-SCENE_WIDTH/2},${-SCENE_HEIGHT/2} L${SCENE_WIDTH/2},${SCENE_HEIGHT/2} M${-SCENE_WIDTH/2},${SCENE_HEIGHT/2} L${SCENE_WIDTH/2},${-SCENE_HEIGHT/2}`} stroke="black" strokeWidth={0.4} />
			<rect {...SCENE_RECT_ATTRS} rx={SCENE_HEIGHT/10} />
		</symbol>
	</defs>
)