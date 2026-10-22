const businessFiles = /^apps\/backend\/src\/(?!realtime\/)(?!main\.ts$)(?!.*(?:\.module|\.controller|-realtime-publisher\.service|\.test)\.ts$).*\.ts$/;

export const moduleBoundaryRules = [
  { name: '共享包不能依赖具体应用实现', from: /^packages\//, disallow: /^apps\// },
  { name: '业务模块通过窄接口发布实时事件', from: businessFiles, disallow: /^apps\/backend\/src\/realtime\/realtime\.service\.ts$/ },
  { name: '业务模块不能调用 HTTP controller', from: businessFiles, disallow: /\.controller\.ts$/ },
];
