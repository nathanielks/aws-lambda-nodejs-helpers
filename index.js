const fetch = require("node-fetch");

module.exports = {
  getParameters,
  errorOnMissingVars,
  getConfig,
  postURL
}

async function getParameters( env, required_params, ssm ) {

	// Detect which parameters already have environment variables defined and
	// reduce to the parameters which still need values populated. This is used
	// for local environments, such as DB_PASS already being defined and not
	// needing a parameter retrieved.
	const params = required_params.reduce( ( acc, curr ) => {
		if ( ! env[curr.replace( 'PARAM_', '' )] ) {
			acc.push( curr );
		}
		return acc;
	}, [] );

	if ( params.length === 0 ) {
		return env;
	}

	// Error if parameters are missing
	errorOnMissingVars( env, params );

	// object keyed on parameter name for reverse lookup when we want to hydrate
	// the environment variable without the PARAM_ prefix later
	const paramsMapReverse = params.reduce( ( acc, curr ) => {
		acc[env[curr]] = curr;
		return acc;
	}, {} );

	// Names of SSM Parameters to retrieve
	const paramNames = params.map( param => env[param] );

	// Get the parameters
	const values = await ssm
		.getParameters( {
			Names: paramNames,
			WithDecryption: true,
		} )
		.promise();

	// Error if parameters weren't found
	if ( values.InvalidParameters.length > 0 ) {
		throw new Error(
			'Failed retrieving SSM parameters: ' + values.InvalidParameters.join( ', ' )
		);
	}

	// Hydrate the env vars without the PARAM_ prefix
	const compiled = values.Parameters.reduce( ( acc, curr ) => {
		acc[paramsMapReverse[curr.Name].replace( 'PARAM_', '' )] = curr.Value;
		return acc;
	}, env );

	return compiled;
}

function errorOnMissingVars( env, vars ) {
	let missingVars = [];
	vars.forEach( key => {
		if ( ! env[key] ) {
			missingVars.push( key );
		}
	} );

	if ( missingVars.length > 0 ) {
		throw new Error( 'Required variables missing: ' + missingVars.join( ', ' ) );
	}
}

function getConfig( env, vars ) {

	errorOnMissingVars( env, vars );

	const config = vars.reduce( ( acc, curr ) => {
		acc[curr] = env[curr];
		return acc;
	}, {} );

	return config;
}

function postURL(url, payload) {
  return fetch(url, {
    method: "POST",
    body: payload,
    timeout: 5000,
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async res => {
    if (!res.ok) {
      // res.status >= 200 && res.status < 300
      const text = await res.text();
      throw new Error("Error recieved communicating with url: " + text);
    }
    return res;
  });
}
