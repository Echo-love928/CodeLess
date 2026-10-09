// Observation data never supplies a verdict independently of process completion and completeness.
export function summarizeNetwork(observations,exitCode) {
  const probes=observations.filter(item=>item.kind==='transport'),expected=new Set(['DEFAULT:HTTP_1_1','DEFAULT:HTTP_2','EXPLICIT_LOOPBACK_PROXY:HTTP_1_1','EXPLICIT_LOOPBACK_PROXY:HTTP_2'])
  const keys=probes.map(p=>p.route+':'+p.requestedProtocol)
  const truncated=observations.some(p=>p.truncated===true)
  const complete=exitCode===0&&!truncated&&keys.length===4&&new Set(keys).size===4&&keys.every(k=>expected.has(k))
  const failed=p=>Array.isArray(p.exceptionClasses)&&p.exceptionClasses.length>0
  const status=p=>Number.isInteger(p.status)&&p.status>=100&&p.status<=599?p.status:null
  const tlsCount=probes.filter(p=>!failed(p)&&!p.truncated&&p.defaultTlsValidated===true).length
  const count401=probes.filter(p=>!failed(p)&&!p.truncated&&status(p)===401).length
  const allSuccess=probes.every(p=>!failed(p)&&p.defaultTlsValidated===true&&status(p)===401)
  const observedFailure=probes.some(p=>failed(p)||p.defaultTlsValidated===false||(status(p)!==null&&status(p)!==401))
  const allTlsAnd401=!complete?null:allSuccess?true:observedFailure?false:null
  return {expectedConnections:4,observedConnections:probes.length,complete,truncated,validatedTlsConnections:tlsCount,http401Connections:count401,
    allTlsAnd401,state:allTlsAnd401===true?'OBSERVED_SUCCESS':allTlsAnd401===false?'OBSERVED_FAILURE':'UNKNOWN',
    conclusion:allTlsAnd401===true?`Observed ${tlsCount} completed connections with validated TLS and HTTP 401. This does not establish the historical failure cause or model repair quality.`:
      `Observed ${tlsCount} validated TLS connections and ${count401} HTTP 401 responses out of ${probes.length} records; overall ${allTlsAnd401===false?'failure':'UNKNOWN'}. No complete TLS/401 success established; historical cause remains UNKNOWN.`}
}
