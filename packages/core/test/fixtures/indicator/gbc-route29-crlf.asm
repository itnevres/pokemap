	object_const_def
	const ROUTE29_YOUNGSTER

Route29_MapScripts:
	def_scene_scripts
	def_callbacks

Route29YoungsterScript:
	jumptextfaceplayer Route29YoungsterText

Route29YoungsterText:
	text "Yo. How are your"
	line "#MON?"
	done

Route29_MapEvents:
	db 0, 0 ; filler

	def_warp_events
	warp_event 27,  1, ROUTE_29_ROUTE_46_GATE, 3

	def_coord_events

	def_bg_events

	def_object_events
	object_event 27, 16, SPRITE_YOUNGSTER, SPRITEMOVEDATA_WALK_UP_DOWN, 0, 1, -1, -1, PAL_NPC_GREEN, OBJECTTYPE_SCRIPT, 0, Route29YoungsterScript, -1
