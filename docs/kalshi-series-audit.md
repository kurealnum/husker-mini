# Kalshi sports series audit

Generated 2026-08-14 by `scripts/audit-kalshi-series.ts`. Re-run to refresh.

Only series whose ticker names match a genuine contest-outcome pattern (`*GAME`, `*MATCH`, `*FIGHT`, `*TOURN`) are audited — prop/spread/corners/total markets are out of scope. Volume is the sum of `volume_fp` across a single page of markets for that series (up to 200), not lifetime volume.

## football

8 candidate series found (tag: Football).

| Ticker | Title | Shape | Sample volume | Settlement sources |
|---|---|---|---|---|
| `KX1HOMEGAME` | First Home Game Opponent | unknown | 0 | Fox Sports, The Wall Street Journal, Associated Press, NFL Network, the Governing League, ESPN |
| `KXCFLGAME` | CFL Game | head_to_head | 7,599,103 | CFL |
| `KXNCAAFD3GAME` | DIII College Football Game | unknown | 0 | ESPN, Kalshi using information originating from the NCAA |
| `KXNCAAFCSGAME` | College Football FCS Game | unknown | 0 | ESPN, Kalshi using information originating from the NCAA |
| `KXNCAAFGAME` | College Football Game | head_to_head | 692,551 | Kalshi using information originating from the NCAA, ESPN |
| `KX1STHOMEGAME` | First Home Game Opponent | unknown | 0 | BBC Sport, CBS Sports, ESPN, Fox Sports, NBC Sports, Reuters, the Associated Press, the official governing body of event |
| `KXUFLGAME` | UFL Football Game | head_to_head | 1,433,043 | UFL |
| `KXNFLGAME` | Professional Football Game | head_to_head | 24,567,066 | the Governing League |

## basketball

67 candidate series found (tag: Basketball).

| Ticker | Title | Shape | Sample volume | Settlement sources |
|---|---|---|---|---|
| `KXGBLGAME` | GBL Basketball Game | head_to_head | 867,128 | Flashscore, Sofascore, 365 Scores |
| `KXWSESBLGAME` | Women's Sweden SBL Game | unknown | 0 | EuroBasket, Sofascore, Flashscore |
| `KXEUROBASKETGAME` | EuroBasket Game | unknown | 0 | EuroBasket, Sofascore, Flashscore |
| `KXABAGAME` | ABA League Game | head_to_head | 371,717 | Flashscore, 365 Scores, Sofascore |
| `KXLNBELITEGAME` | LNB Elite Game | head_to_head | 1,867,185 | Sofascore, Flashscore, LNB Elite |
| `KXSLBGAME` | England Super League Basketball Game | unknown | 0 | Super League Basketball, Sofascore, Flashscore |
| `KXSPBGAME` | Venezuela Superliga Game | head_to_head | 190,805 | Flashscore, Sofascore, Basketball24 |
| `KXLBPGAME` | Colombia LBP Basketball Game | head_to_head | 3,297 | 365scores, Basketball24, Sofascore, Flashscore |
| `KXWEUROBASKETGAME` | Women's EuroBasket Game | unknown | 0 | EuroBasket, Sofascore, Flashscore |
| `KXNCAAMBGAME` | Men's College Basketball Men's Game | unknown | 0 | Kalshi using information originating from the NCAA, ESPN |
| `KXVTBGAME` | VTB United League Game | head_to_head | 341,202 | 365 Scores, Sofascore, Flashscore |
| `KXNBAGAME` | Pro Basketball Game | head_to_head | 455,266,003 | the Governing League |
| `KXWNBAGAME` | Women's Pro Basketball Game | head_to_head | 360,308,145 | ESPN, the Governing League |
| `KXCZENBLGAME` | Czech NBL Game | unknown | 0 | EuroBasket, Sofascore, Flashscore |
| `KXIBPLGAME` | Men's Iceland Basketball Premier League Game | unknown | 0 | 365 Scores, 24live, Sofascore, Flashscore |
| `KXBIG3GAME` | Big 3 Basketball Game | head_to_head | 94,579 | BIG3, CBS Sports, ESPN, Fox Sports |
| `KXFIBAGAME` | FIBA Game | head_to_head | 12,823,585 | ESPN, Sofascore, Flashscore |
| `KXNCAABGAME` | College Basketball Game | unknown | 0 | Kalshi using information originating from the NCAA, ESPN |
| `KXSESBLGAME` | Sweden SBL Game | unknown | 0 | EuroBasket, Sofascore, Flashscore |
| `KXBALGAME` | Basketball Africa League Game | unknown | 0 | Fox Sports, Flashscore, BAL, ESPN |
| `KXBILGAME` | Ball is Life Basketball Game | head_to_head | 656,645 | Ballislife, Ballislife Instagram |
| `KXFIBACHAMPGAME` | FIBA Champions League Game | unknown | 0 | Sofascore, Flashscore, FIBA Champions League |
| `KXDBBSUPERGAME` | DBB Supercup Game | unknown | 0 | 365 Scores, Sofascore, Flashscore |
| `KXBBLGAME` | Bundesliga Basketball Game | head_to_head | 1,629,937 | EuroBasket, easyCredit BBL, 365 Scores, Sofascore |
| `KXARGLNBGAME` | Liga Nacional de Basquetbol Game | head_to_head | 54,903 | Sofascore |
| `KXUNRIVALEDGAME` | Unrivaled Basketball Game | unknown | 0 | Unrivaled |
| `KXBNXTGAME` | BNXT League Game | unknown | 0 | BNXT, 365 Scores, Sofascore, Flashscore |
| `KXBNXTDGAME` | BNXT Dutch League Game | unknown | 0 | Sofascore, Flashscore, BNXT, 365 Scores |
| `KXNBAALLSTARGAME` | NBA All-Star Game Winner | unknown | 0 | ESPN, Fox Sports, the Governing League |
| `KXCEBLGAME` | Canadian Elite Basketball League Game | head_to_head | 85,063 | Sofascore, Flashscore, CEBL, ESPN |
| `KXNCAAWBGAME` | College Basketball Women's Game | unknown | 0 | ESPN, Kalshi using information originating from the NCAA |
| `KXEUROCUPGAME` | EuroCup Basketball Game | unknown | 0 | Eurocup |
| `KXDBBGAME` | Deutscher Basketball Bund (DBB) Game | unknown | 0 | 365 Scores, Sofascore, Flashscore |
| `KXEUROLEAGUEGAME` | Euroleague Game | unknown | 0 | the Governing League, ESPN, Sofascore, Flashscore |
| `KXNCAAMBD3GAME` | Men's College Basketball D3 Game | unknown | 0 | Kalshi using information originating from the NCAA, ESPN |
| `KXWIBPLGAME` | Women's Iceland Premier League Game | unknown | 0 | 365 Scores, 24live, Sofascore, Flashscore |
| `KXCBAGAME` | Chinese Basketball Association Game  | unknown | 0 | Sofascore, CBA |
| `KXBBSERIEBGAME` | Italy Serie B Basketball Game | head_to_head | 308,434 | 24live, Lega Pallacanestro, Sofascore, Flashscore |
| `KXTBTGAME` | TBT Hoops Game | head_to_head | 350,640 | TBT Hoops, Fox Sports, ESPN |
| `KXFIBACHAMPLEAGUEGAME` | FIBA Champions League Game | unknown | 0 | FIBA Champions League |
| `KXWFIBAGAME` | Women's FIBA Game | unknown | 0 | ESPN, FIBA Women's Basketball, Sofascore, Flashscore |
| `KXBSNGAME` | Puerto Rico BSN Basketball Game | head_to_head | 2,090,063 | 365 Scores, Basketball24, Sofascore, Flashscore |
| `KXACBGAME` | Liga ACB Basketball Game | head_to_head | 2,455,686 | Sofascore, ESPN, 365 Scores, Flashscore |
| `KXLPBGAME` | Portugal LPB Game | head_to_head | 156,476 | Sofascore, Basketball24, Flashscore |
| `KXVBAGAME` | Vietnam VBA Game | head_to_head | 866,120 | 24live, Sofascore, Flashscore, Basketball24 |
| `KXLNBPGAME` | LNBP Basketball Game | head_to_head | 8,218,706 | 365 Scores, 24live, Sofascore, Flashscore |
| `KXNBBGAME` | Brazil NBB Basketball Game | unknown | 0 | Basketball24, 365 Scores, Sofascore, Flashscore |
| `KXSBLGAME` | Slovakia SBL Game | unknown | 0 | Basketball24, Flashscore, Sofascore |
| `KXKBLGAME` | Korea KBL Game | unknown | 0 | Flashscore, Sofascore |
| `KXISLGAME` | Israel Super League Game | head_to_head | 2,814,157 | Basketball24, Flashscore, Israel Basketball Super League |
| `KXLNBELITE2GAME` | LNB Elite 2 Game | unknown | 0 | EuroBasket, Sofascore, Flashscore |
| `KXPBAGAME` | Philippine Basketball Association Game | head_to_head | 1,119,789 | 365 Scores, Sofascore, Flashscore, PBA |
| `KXBBSERIEAGAME` | Italy Serie A Basketball Game | head_to_head | 390,295 | Sofascore, 365 Scores, Flashscore |
| `KXSOBBALLGAME` | Summer Olympics Men's Basketball Game | unknown | 0 | USA Basketball, Sofascore, Flashscore, ESPN |
| `KXPLKGAME` | Poland PLK Game | head_to_head | 856,465 | Flashscore, Sofascore |
| `KXKORISLIIGAGAME` | Finland Korisliiga Game | unknown | 0 | EuroBasket, Sofascore, Flashscore |
| `KXJUDGEMENTDAYGAME` | Ballislife x OTD | Judgement Day 1v1 Game | unknown | 0 | Ballislife, Ballislife Instagram |
| `KXWSBLGAME` | Sweden SBL Game | unknown | 0 | Eurobasket, Sofascore, Flashscore |
| `KXNBACELEBRITYGAME` | Pro Basketball All-Star Celebrity Game | unknown | 0 | ESPN, the league governing the game |
| `KXNBASUMMERGAME` | Pro Basketball Summer League Game | head_to_head | 207,708,112 | the Governing League, ESPN |
| `KXJBLEAGUEGAME` | Japan B League Game | unknown | 0 | Sofascore, Flashscore |
| `KXBSLGAME` | Turkey BSL Game | head_to_head | 2,025,023 | Sofascore, Flashscore |
| `KXWNBAASGAME` | WNBA All Star Game | unknown | 0 | the Governing League, ESPN |
| `KXNBLGAME` | NBL Basketball Game | unknown | 0 | NBL, Sofascore, Flashscore, ESPN |
| `KXSOWBBALLGAME` | Summer Olympics Women's Basketball Game | unknown | 0 | Sofascore, Flashscore, FIBA, ESPN |
| `KXFIBAECUPGAME` | FIBA Europe Cup Game | head_to_head | 0 | FIBA Europe Cup |
| `KXNZNBLGAME` | New Zealand NBL Game | head_to_head | 2,307,414 | Sofascore, Flashscore, New Zealand NBL |

## hockey

10 candidate series found (tag: Hockey).

| Ticker | Title | Shape | Sample volume | Settlement sources |
|---|---|---|---|---|
| `KXLIIGAGAME` | Liiga Game | unknown | 0 | Flashscore, Sofascore |
| `KXNHLGAME` | NHL Game | head_to_head | 42,492,061 | NHL |
| `KXDELGAME` | DEL Game | unknown | 0 | Sofascore, Flashscore |
| `KXKHLGAME` | KHL Game | unknown | 0 | KHL, Sofascore |
| `KXSHLGAME` | SHL Game | unknown | 0 | Sofascore, Flashscore |
| `KXELHGAME` | ELH Game | unknown | 0 | Flashscore, Sofascore |
| `KXAHLGAME` | AHL Game | head_to_head | 445,068 | AHL |
| `KXIIHFGAME` | IIHF Game | unknown | 0 | ESPN, IIHF, NHL |
| `KXNLGAME` | National League Game | unknown | 0 | Flashscore, Sofascore |
| `KXNCAAHOCKEYGAME` | College Hockey Game | unknown | 0 | ESPN |

## baseball

11 candidate series found (tag: Baseball).

| Ticker | Title | Shape | Sample volume | Settlement sources |
|---|---|---|---|---|
| `KXMLBSTGAME` | Pro Baseball Spring Training game | unknown | 0 | ESPN, Fox Sports, the Governing League |
| `KXNCAABBGAME` | College Baseball Game | head_to_head | 21,868,539 | Sofascore, D1 Baseball, CBS Sports, Fox Sports, Kalshi using information originating from the NCAA, ESPN |
| `KXMLBGAME` | Professional Baseball Game | head_to_head | 227,947,271 | ESPN, Fox Sports, the Governing League |
| `KXMLBASGAME` | Professional Baseball All-Star Game | head_to_head | 804,035 | ESPN, Fox Sports, the Governing League |
| `KXLMBGAME` | Mexican Baseball League | head_to_head | 758,758 | Flashscore, LMB |
| `KXNPBGAME` | Japan NPB Game | head_to_head | 20,086,017 | ESPN, Flashscore |
| `KXKBOGAME` | KBO Game | head_to_head | 9,912,361 | KBO |
| `KXWBCGAME` | World Baseball Classic Game | unknown | 0 | World Baseball Classic |
| `KXNCAASBGAME` | College Softball Game | unknown | 0 | Kalshi using information originating from the NCAA, ESPN, Fox Sports |
| `KXMLBFTGAME` | Pro Baseball Futures Game | head_to_head | 7,639 | ESPN, Fox Sports, the Governing League |
| `KXMILBGAME` | MILB Game | head_to_head | 35 | the Governing League |

## soccer

137 candidate series found (tag: Soccer).

| Ticker | Title | Shape | Sample volume | Settlement sources |
|---|---|---|---|---|
| `KXDFBPOKALGAME` | DFB Pokal Game | three_way | 9,540 | ESPN, Fox Sports |
| `KXENGNLGAME` | English National League Game | three_way | 0 | ESPN, Fox Sports |
| `KXEFLL1GAME` | EFL League One Game | three_way | 721 | ESPN, Fox Sports |
| `KXURYPDGAME` | Uruguay Primera Division Game | three_way | 11,709,283 | ESPN, Fox Sports |
| `KXMLSASTGAME` | MLS All Star Game | three_way | 205,988 | ESPN, Fox Sports |
| `KXFROPLGAME` | Faroe Islands Premier League Game | three_way | 0 | ESPN, Fox Sports |
| `KXMYSLGAME` | Malaysia Super League Game | unknown | 0 | ESPN, Fox Sports |
| `KXWCGOALEVERYGAME` | World Cup Goal in Every Game | unknown | 377,252 | ESPN, FIFA |
| `KXLVAVIRGAME` | Latvian Virsliga Game | three_way | 0 | ESPN, Fox Sports |
| `KXTFF1LIGGAME` | TFF 1. Lig Game | three_way | 3 | ESPN, Fox Sports |
| `KXGRECUPGAME` | Greek Cup Game | three_way | 0 | ESPN, Fox Sports |
| `KXALEAGUEGAME` | Australian A League Game | unknown | 0 | ESPN, Fox Sports |
| `KXFINYLGAME` | Finnish Ykkosliiga Game | three_way | 42 | ESPN, Fox Sports |
| `KXSERIEAGAME` | Serie A Game | three_way | 999 | ESPN, Fox Sports |
| `KXJLEAGUEGAME` | Japan J League Game | three_way | 3,103,485 | ESPN, Fox Sports |
| `KXUAEPLGAME` | UAE Pro League | three_way | 1,595 | ESPN, Fox Sports |
| `KXAPFDDHGAME` | APF Division de Honor Game | three_way | 12,412,118 | ESPN, Fox Sports |
| `KXDENSUPERLIGAGAME` | Danish Superliga Game | three_way | 4,418,730 | ESPN, Fox Sports |
| `KXCHNSLGAME` | Chinese Super League Game | three_way | 15,554,905 | ESPN, Fox Sports |
| `KXVENFUTVEGAME` | Venezuela Liga FUTVE game | three_way | 2,062,496 | ESPN, Fox Sports |
| `KXECULPGAME` | Ecuador Liga Pro Game | three_way | 55,492,509 | ESPN, Fox Sports |
| `KXBUNDESLIGAGAME` | Bundesliga Game | three_way | 0 | ESPN, Fox Sports |
| `KXCZEFLGAME` | Czech First League Game | three_way | 5,337,297 | ESPN, Fox Sports |
| `KXSRBCUPGAME` | Serbian Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXFINALISSIMAGAME` | Finalissima | unknown | 0 | ESPN, Fox Sports |
| `KXCHNL1GAME` | China League 1 Game | unknown | 0 | ESPN, Fox Sports |
| `KXARGNACBGAME` | Argentine Nacional B Game | three_way | 5,066,350 | ESPN, Fox Sports |
| `KXCOPADOBRASILGAME` | Copa do Brasil Game | three_way | 5,561,429 | ESPN, Fox Sports |
| `KXKLEAGUEGAME` | Korea K League Game | three_way | 8,136,406 | ESPN, Fox Sports |
| `KXCOUPEDEFRANCEGAME` | Coupe de France Game | unknown | 0 | ESPN, Fox Sports |
| `KXISRNLGAME` | Liga Leumit Game | three_way | 0 | ESPN, Fox Sports |
| `KXLALIGAGAME` | La Liga Game | three_way | 50,488 | ESPN, Fox Sports |
| `KXSVK2LGAME` | Slovakian 2. Liga Game | three_way | 9 | ESPN, Fox Sports |
| `KXASEANGAME` | ASEAN Game | three_way | 13,105,998 | ESPN, Fox Sports |
| `KXK2LEAGUEGAME` | Korea K-League 2 Game | unknown | 0 | ESPN, Fox Sports |
| `KXSGPPLGAME` | Singapore Premier League Game | unknown | 0 | ESPN, Fox Sports |
| `KXBUNDESLIGA2GAME` | Bundesliga 2 Game | three_way | 1,025,715 | ESPN, Fox Sports |
| `KXTHAIL1GAME` | Thai League 1 Game | unknown | 0 | ESPN, Fox Sports |
| `KXPRYLIGA1GAME` | delete | unknown | 0 | ESPN, Fox Sports |
| `KXVLEAGUE1GAME` | Vietnam V-League 1 Game | unknown | 0 | ESPN, Fox Sports |
| `KXAFCONGAME` | AFCON Game Winner | unknown | 0 | ESPN, Fox Sports |
| `KXAFCACGAME` | AFC Asia Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXSVKCUPGAME` | Slovakian Cup Game | three_way | 0 | ESPN, Fox Sports |
| `KXLIGUE2GAME` | Ligue 2 Game | three_way | 0 | ESPN, Fox Sports |
| `KXLIGAEXPGAME` | Liga Expansion Game | three_way | 4,868,318 | ESPN, Fox Sports |
| `KXCONCACAFCCUPGAME` | CONCACAF Champions Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXSLGREECEGAME` | Super League Greece Game | unknown | 0 | ESPN, Fox Sports |
| `KXSERIEAWGAME` | Serie A Femminile Game | unknown | 0 | ESPN, Fox Sports |
| `KXENGCSGAME` | England Community Shield | three_way | 3,498 | ESPN, Fox Sports |
| `KXTWEEDEDIVGAME` | Tweede Divisie Game | three_way | 0 | ESPN, Fox Sports |
| `KXEKSTRAKLASAGAME` | Polish Ekstraklasa Game | three_way | 6,090,774 | ESPN, Fox Sports |
| `KXEGYPLGAME` | Egyptian Premier League Game | three_way | 0 | ESPN, Fox Sports |
| `KXUEFAGAME` | UEFA Soccer Games | unknown | 0 | ESPN, Fox Sports |
| `KXSVNPLGAME` | Slovenian Prva Liga Game | three_way | 0 | ESPN, Fox Sports |
| `KXSERIECGAME` | Serie C Game | three_way | 0 | ESPN, Fox Sports |
| `KXFACUPGAME` | FA Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXCHLLDPGAME` | Chile Liga de Primera Game | three_way | 10,239,238 | ESPN, Fox Sports |
| `KXCONMEBOLLIBGAME` | CONMEBOL Libertadores Game | three_way | 5,281,789 | ESPN, Fox Sports |
| `KXFINCUPGAME` | Suomen Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXCLUBFGAME` | Club Friendlies | three_way | 7,593,550 | ESPN, Fox Sports |
| `KXSAUDIPLGAME` | Saudi Pro League Game | three_way | 822,836 | ESPN, Fox Sports |
| `KXFRASUPERCUPGAME` | France Super Cup Game | three_way | 2,140 | ESPN, Fox Sports |
| `KXIDNSLGAME` | Indonesia Super League Game | unknown | 0 | ESPN, Fox Sports |
| `KXLIGAPORTUGALGAME` | Liga Portugal Game | three_way | 5,015,736 | ESPN, Fox Sports |
| `KXSERIEBGAME` | Serie B Game | three_way | 0 | ESPN, Fox Sports |
| `KXPERLIGA1GAME` | Peru Liga 1 Game | three_way | 18,245,954 | ESPN, Fox Sports |
| `KXETTANGAME` | Ettan Game | three_way | 13 | ESPN, Fox Sports |
| `KXBOLPDIVGAME` | Bolivia Premier Division Game | three_way | 2,713,730 | ESPN, Fox Sports |
| `KXBALLERLEAGUEGAME` | Baller League Game | three_way | 0 | Baller League, FotMob |
| `KXJ2LEAGUEGAME` | Japan J2 League Game | unknown | 0 | ESPN, Fox Sports |
| `KXEWSLGAME` | England Women's Super League Game | unknown | 0 | ESPN, Fox Sports |
| `KXKXECULPGAME` | delete | unknown | 0 | ESPN, Fox Sports |
| `KXELITESERIENGAME` | Eliteserien Game | three_way | 14,927,710 | ESPN, Fox Sports |
| `KXFIFAUSPULLGAME` | FIFA US pull game | unknown | 38,302 | 2026 FIFA World Cup organizing committee, U.S. Soccer Federation, Fox Sports, ABC, Fox News, The Wall Street Journal, MSNBC, NBC, FIFA, The Washington Post, Sky Sports, Sporting News, The New York Times, BBC Sport, Reuters, ESPN, The Athletic, CNN, the Associated Press, CBS, Bloomberg News |
| `KXBRASILEIROCGAME` | Brasileiro Serie C Game | three_way | 8,800,503 | ESPN, Fox Sports |
| `KXLEAGUESCUPGAME` | Leagues Cup Game | three_way | 148,177,440 | ESPN, Fox Sports |
| `KXWCTEAMSINGAME` | World Cup Teams in Game | unknown | 227,847 | FIFA, ESPN |
| `KXUSLCUPGAME` | USL Cup Game | three_way | 715,227 | ESPN, Fox Sports |
| `KXWCGAME` | World Cup Game | three_way | 2,475,596,701 | ESPN, Fox Sports |
| `KXLIGUE1GAME` | Ligue 1 Game | three_way | 1,243 | ESPN, Fox Sports |
| `KXCONMEBOLSUDGAME` | CONMEBOL Sudamericana Game | three_way | 13,802,841 | ESPN, Fox Sports |
| `KXEERSTEDIVGAME` | Eerste Divisie Game | three_way | 0 | ESPN, Fox Sports |
| `KXSCOCUPGAME` | Scottish Cup Game | three_way | 3,219,053 | ESPN, Fox Sports |
| `KXAFCCLGAME` | AFC Champions League Game | three_way | 188,446 | ESPN, Fox Sports |
| `KXUELGAME` | UEFA Europa League Game | three_way | 14,564,234 | ESPN, Fox Sports |
| `KXMLSGAME` | Major League Soccer Game | three_way | 35,416,381 | MLS |
| `KXTACAPORTGAME` | Taca de Portugal Game | unknown | 0 | ESPN, Fox Sports |
| `KXFIFAWGAME` | FIFA Women's Game | three_way | 1,640,415 | ESPN, Fox Sports |
| `KXSERIECCUPGAME` | Coppa Italia Lega Pro Game | three_way | 0 | ESPN, Fox Sports |
| `KXEFLCHAMPIONSHIPGAME` | EFL Championship Game | three_way | 23,839 | ESPN, Fox Sports |
| `KXCLUBWCGAME` | Club World Club Game | unknown | 0 | ESPN, Fox Sports |
| `KXSCOTTISHPREMGAME` | Scottish Premiership Game | three_way | 5,017,487 | ESPN, Fox Sports |
| `KXBRASILEIROGAME` | Brasileiro Serie A Game | three_way | 33,342,590 | ESPN, Fox Sports |
| `KXLALIGA2GAME` | LaLiga 2 Game | three_way | 2,069,854 | ESPN, Fox Sports |
| `KXINTERCONCUPGAME` | Intercontinental Cup Match | unknown | 0 | ESPN, FIFA |
| `KXISRPLCUPGAME` | Premier League Cup Game | three_way | 0 | ESPN, Fox Sports |
| `KXALLSVENSKANGAME` | Allsvenskan Game | three_way | 19,522,843 | ESPN, Fox Sports |
| `KXDANISHSUPERLIGAGAME` | Danish Superliga Game | unknown | 0 | ESPN, Fox Sports |
| `KXUECLGAME` | UEFA Conference League Game | three_way | 8,200,030 | ESPN, Fox Sports |
| `KXUEFANLGAME` | UEFA Nations League Game | unknown | 0 | ESPN, Fox Sports |
| `KXISRPLGAME` | Israeli Premier League Game | unknown | 0 | ESPN, Fox Sports |
| `KXEFLCUPGAME` | EFL Cup Game | three_way | 1,403,691 | ESPN, Fox Sports |
| `KXUSOPENCUPGAME` | US Open Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXHNLGAME` | Croatia HNL Game | three_way | 1,833,876 | ESPN, Fox Sports |
| `KXISRNLCUPGAME` | National League Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXCOPADELREYGAME` | Copa Del Rey Game | unknown | 0 | ESPN, Fox Sports |
| `KXISRSUPCUPGAME` | Super Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXSUPERLIGGAME` | Turkish Super Lig Game | three_way | 9,432 | ESPN, Fox Sports |
| `KXEREDIVISIEWGAME` | Eredivisie Vrouwen Game | three_way | 0 | ESPN, Fox Sports |
| `KXBELGIANPLGAME` | Belgian Pro League Game | three_way | 2,368,027 | ESPN, Fox Sports |
| `KXQSTARSGAME` | Qatar Stars League | unknown | 0 | ESPN, Fox Sports |
| `KXESPSUPERCUPGAME` | Spain Super Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXARGPREMDIVGAME` | Argentina Primera Division Game | three_way | 39,873,504 | ESPN, Fox Sports |
| `KXUEFASCGAME` | UEFA Super Cup | three_way | 1,748,138 | ESPN, Fox Sports |
| `KXITASUPERCUPGAME` | Italy Super Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXDIMAYORGAME` | Liga DIMAYOR Game | three_way | 16,976,442 | ESPN, Fox Sports |
| `KXFROCUPGAME` | Faroe Islands Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXSVNCUPGAME` | Slovenian Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXSWISSLEAGUEGAME` | Swiss Super League Game | three_way | 2,779,137 | ESPN, Fox Sports |
| `KXFIFAGAME` | Fifa Game | unknown | 0 | ESPN, Fox Sports |
| `KXCZEFNLGAME` | Czech National Football League Game | three_way | 0 | ESPN, Fox Sports |
| `KXGER3LGAME` | German 3. Liga Game | three_way | 0 | ESPN, Fox Sports |
| `KXUCLGAME` | UEFA Champions League Game | three_way | 29,212,699 | ESPN, Fox Sports |
| `KXBRASILEIROBGAME` | Brasileiro Serie B Game | three_way | 24,588,866 | ESPN, Fox Sports |
| `KXCOPPAITALIAGAME` | Coppa Italia Game | three_way | 67,378 | ESPN, Fox Sports |
| `KXSRBSLGAME` | Serbian SuperLiga Game | three_way | 0 | ESPN, Fox Sports |
| `KXLIGAMXGAME` | Liga MX Game | three_way | 111,988,856 | ESPN, Fox Sports |
| `KXNWSLGAME` | NWSL Game | three_way | 20,771,582 | ESPN, Fox Sports |
| `KXISRSCUPGAME` | State Cup Game | unknown | 0 | ESPN, Fox Sports |
| `KXSERIECSCUPGAME` | Supercoppa di Lega Pro Game | unknown | 0 | ESPN, Fox Sports |
| `KXEREDIVISIEGAME` | Eredivisie Game | three_way | 2,777,192 | ESPN, Fox Sports |
| `KXINTLFRIENDLYGAME` | International Friendly Game | three_way | 27,081,109 | ESPN, Fox Sports |
| `KXUSLGAME` | USL Championship Game | three_way | 9,156,652 | ESPN, Fox Sports |
| `KXEPLGAME` | English Premier League Game | three_way | 87,813 | ESPN, Fox Sports |
| `KXUCLWGAME` | Champions League Women's Game | three_way | 1,309,205 | ESPN, Fox Sports |
| `KXCANPLGAME` | Canadian Premier League | three_way | 1,927,226 | ESPN, Fox Sports |
| `KXKNVBCUPGAME` | KNVB Cup Game | unknown | 0 | ESPN, Fox Sports |

## tennis

14 candidate series found (tag: Tennis).

| Ticker | Title | Shape | Sample volume | Settlement sources |
|---|---|---|---|---|
| `KXSIXKINGSSLAMMATCH` | Six Kings Slam Match | unknown | 0 | The Wall Street Journal, ESPN, Fox Sports |
| `KXATPEXACTMATCH` | ATP Exact Match Score | field | 828,530 | ATP |
| `KXITFMATCH` | ITF Men's Match | head_to_head | 22,133,001 | ITF, Flashscore, Fox Sports, ESPN |
| `KXWTAEXACTMATCH` | WTA Exact Match Score | field | 578,128 | WTA, ESPN |
| `KXPICKLEBALLMATCH` | Pickleball Match | head_to_head | 267 | ESPN, PPL |
| `KXWTAMATCH` | WTA Tennis Match | head_to_head | 221,238,193 | WTA |
| `KXITFWMATCH` | ITF Women's Match | head_to_head | 20,009,981 | ITF, ESPN, Flashscore, Fox Sports |
| `KXCHALLENGERMATCH` | Challenger ATP  | unknown | 0 | ATP |
| `KXATPMATCH` | ATP Tennis Match | head_to_head | 261,062,338 | ATP |
| `KXWTACHALLENGERMATCH` | Challenger WTA | head_to_head | 99,490,307 | WTA |
| `KXSIXKINGSMATCH` | Six Kings Slam Match | unknown | 0 | The Wall Street Journal, ESPN, Fox Sports, AP |
| `KXATPCHALLENGERMATCH` | Challenger ATP  | head_to_head | 148,528,889 | ATP |
| `KXDAVISCUPMATCH` | Davis Cup Match | unknown | 0 | Davis Cup |
| `KXUNITEDCUPMATCH` | United Cup Match | unknown | 0 | The Wall Street Journal, ESPN, Fox Sports |

## mma

2 candidate series found (tag: MMA).

| Ticker | Title | Shape | Sample volume | Settlement sources |
|---|---|---|---|---|
| `KXMMAFIGHT` | MMA Fight | head_to_head | 1,413,581 | ESPN, PFL, Tapology, Sofascore, Flashscore |
| `KXUFCFIGHT` | UFC Fight | head_to_head | 197,003,132 | DAZN, ESPN, Fox Sports, the Governing League |

## golf

1 candidate series found (tag: Golf).

| Ticker | Title | Shape | Sample volume | Settlement sources |
|---|---|---|---|---|
| `KXGOLFTOURN` | Golf Tournament Winner | field | 163,773 | Fox Sports, NBC Sports, ESPN |

## volleyball

1 candidate series found (tag: Volleyball).

| Ticker | Title | Shape | Sample volume | Settlement sources |
|---|---|---|---|---|
| `KXVOLLEYBALLMATCH` | Volleyball Match | head_to_head | 0 | ESPN, Sofascore, NORCECA, Flashscore, Volleyball World |

**Do not build volleyball.** The only live series, `KXVOLLEYBALLMATCH`, shows zero recorded volume across all its markets (sample events are the Pan American Cup, not NCAA — ESPN's only volleyball coverage). Close the volleyball issue rather than building a pipeline for it.

## Fee categories

`readFeeTakerCoeffTenThousandths` (src/lib/market-edge.ts:19) reads `KALSHI_FEE_TAKER_COEFF_<CATEGORY>` keyed by the league registry key in upper case (e.g. `KALSHI_FEE_TAKER_COEFF_NFL`), falling back to the category-less `KALSHI_FEE_TAKER_COEFF` (0.07) when unset. No new-sport series above have a per-category override configured yet — a future league's pipeline should pass its registry key as the category and add an env var override only if its fee schedule differs from the default.

## Recommendations

- **Do not build volleyball.** The only live series, `KXVOLLEYBALLMATCH`, shows zero recorded volume across all its markets (sample events are the Pan American Cup, not NCAA — ESPN's only volleyball coverage). Close the volleyball issue rather than building a pipeline for it.