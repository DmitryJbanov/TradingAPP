import { backlog } from "../domain/backlog";
import { SiteHeader } from "./site-header";
export function BacklogPage() {
  return (
    <div className="terminal-shell">
      <SiteHeader active="backlog" />
      <main className="dashboard backlog-page">
        <div className="page-heading">
          <div>
            <div className="eyebrow">ROADMAP</div>
            <h1>Беклог проекта</h1>
            <p>Запланированные доработки: {backlog.length}</p>
          </div>
        </div>
        <section className="panel">
          <ol className="backlog-list">
            {backlog.map((task) => (
              <li key={task.id}>
                <h2>{task.title}</h2>
                <p>{task.description}</p>
              </li>
            ))}
          </ol>
          {!backlog.length && (
            <p className="empty-state">Все запланированные задачи выполнены.</p>
          )}
        </section>
        <a className="button" href="/">
          Вернуться к рынкам
        </a>
      </main>
    </div>
  );
}
