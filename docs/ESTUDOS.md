# Estudos

Abra **Estudos** no menu lateral. Crie um **livro** (com autor e status de leitura) ou uma **matéria**. Cada coleção guarda suas próprias notas.

1. Selecione uma coleção e clique em **Nova nota**.
2. Escreva o título e o conteúdo. O editor aceita Markdown: títulos, listas, tabelas, tarefas, citações e código.
3. Adicione tags separadas por vírgulas e, se quiser, um link de referência HTTP/HTTPS.
4. Clique em **Salvar nota**. O indicador informa quando há alterações ainda não salvas.
5. Alterne para **Leitura** para ver o texto formatado.

## Conectar notas

Use `[[Título da nota]]` para ligar uma ideia a outra. Se o mesmo título existir em várias coleções, use `[[Nome da coleção/Título da nota]]`. O seletor **Vincular outra nota** insere um vínculo por identificador (`[[id|título]]`), que continua funcionando se a nota mudar de nome. Links digitados pelo título precisam ser atualizados quando o título muda. Notas ainda inexistentes ou ambíguas ficam como texto.

A seção **Referências a esta nota** mostra os links de volta. A busca da biblioteca pesquisa o conteúdo, título e tags das notas da coleção selecionada; a busca global do app encontra títulos de livros, matérias e notas.

## Arquivos e organização

Após salvar uma nota, clique no clipe ou em **Arquivos** para enviar PDF, PNG, JPEG, WebP ou TXT, com limite de **2 MB por arquivo**. Os arquivos são privados e podem ser visualizados, baixados ou excluídos. Links para imagens no Markdown não carregam imagens externas automaticamente; use o link de abertura ou os anexos.

É possível editar livros e matérias, mover uma nota para outra coleção pelo editor e excluir registros. Remova os anexos antes de excluir uma nota e mova ou exclua as notas antes de excluir a coleção. Estudos participa do backup/restauração e da exclusão de dados da conta.

As notas são privadas por conta, mas não usam a senha mestra nem a criptografia ponta a ponta do Cofre. O módulo não inclui grafo visual, sincronização de uma pasta Obsidian ou plugins do Obsidian.

Implementação de leitura baseada em [react-markdown](https://github.com/remarkjs/react-markdown), sem HTML executável. O isolamento usa as [políticas de RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
