export function findModuleBoundaryViolations(graph, rules) {
  const violations = [];

  for (const [importer, dependencies] of graph) {
    for (const rule of rules) {
      if (!rule.from.test(importer)) continue;
      for (const dependency of dependencies) {
        if (!rule.disallow.test(dependency)) continue;
        violations.push({
          rule: rule.name,
          importer,
          dependency,
        });
      }
    }
  }

  return violations.sort(
    (left, right) =>
      left.rule.localeCompare(right.rule) ||
      left.importer.localeCompare(right.importer) ||
      left.dependency.localeCompare(right.dependency),
  );
}
