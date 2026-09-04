import type { VerificationTestFile } from "../shared/types.ts";

export function TestResultsView({ files }: { files: VerificationTestFile[] }) {
  if (!files.length) return <p className="hint">No supported test-result files were found.</p>;
  return <div className="test-result-files">{files.map((file) => <section className="test-result-file" key={file.fileName}><header><h2>{file.fileName}</h2><time dateTime={file.modifiedAt}>Modified {new Date(file.modifiedAt).toLocaleString()}</time></header>{file.tests.length ? <ul>{file.tests.map((test, index) => <li className={`test-result ${test.status}`} key={`${test.name}-${index}`}><span className="test-status">{test.status}</span><span>{test.name}</span></li>)}</ul> : <p className="hint">No tests were recognized in this file.</p>}</section>)}</div>;
}
