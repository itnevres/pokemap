Route101_EventScript_PokemonIndicator1::
	lock
	faceplayer
	waitse
	playmoncry SPECIES_ZIGZAGOON, CRY_MODE_NORMAL
	msgbox Route101_Text_PokemonIndicator1, MSGBOX_DEFAULT
	waitmoncry
	closemessage
	release
	end

Route101_Text_PokemonIndicator1:
	.string "Zig!$"
