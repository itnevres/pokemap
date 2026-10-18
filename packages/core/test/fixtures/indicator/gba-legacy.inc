Route101_EventScript_WildSign_Poliwrath::
	lock
	faceplayer
	waitse
	playmoncry SPECIES_POLIWRATH, CRY_MODE_NORMAL
	msgbox Route101_Text_WildSign_Poliwrath, MSGBOX_DEFAULT
	waitmoncry
	closemessage
	release
	end

Route101_Text_WildSign_Poliwrath:
	.string "POLIWRATH: Ribi ribit!$"
