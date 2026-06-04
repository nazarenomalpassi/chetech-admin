alter table public.tv_boards
drop constraint if exists tv_boards_board_type_check;

alter table public.tv_boards
add constraint tv_boards_board_type_check
check (board_type in ('fuente', 'main', 'tcom', 'placa_unica'));
