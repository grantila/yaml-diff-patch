#!/usr/bin/env node

import { oppa, Oppa } from "oppa"
import { promises } from "fs"
import * as path from "path"

import { yamlPatch, yamlDiffPatch, yamlOverwrite } from ".."


const binName =
	path.basename( process.argv[ 1 ], path.extname( process.argv[ 1 ] ) );

const bailHelp = ( op: Oppa< any > ) =>
{
	op.showHelp( false );
	process.exit( 1 );
}

const argOutput = {
	name: 'output',
	alias: 'o',
	type: 'string',
	description: 'Output filename to write to, or "-" for stdout',
	default: '-',
	argumentName: 'file',
} as const;

async function writeOut( result: string, output: string )
{
	if ( output === '' )
		process.stdout.write( result );
	else
		await promises.writeFile( output, result );
}

async function main( )
{
	if ( binName === 'yaml-patch' )
	{
		const op =
			oppa( {
				name: binName,
				usage: `${binName} source.yaml patch.json`,
				description:
					`Patches <source.yaml> with the RFC6902 in <patch.json>`
			} )
			.add( argOutput );

		const { rest, args } = op.parse( );
		const { output } = args;
		const [ yamlSourceFile, jsonPatchFile ] = rest;
		if ( !jsonPatchFile )
			bailHelp( op );

		const [ yamlSource, jsonPatch ] = await Promise.all( [
			promises.readFile( yamlSourceFile, 'utf-8' ),
			promises.readFile( jsonPatchFile, 'utf-8' ),
		] );

		const res = yamlPatch( yamlSource, JSON.parse( jsonPatch ) );
		await writeOut( res, output );
	}
	else if ( binName === 'yaml-diff-patch' )
	{
		const op =
			oppa( {
				name: binName,
				usage: `${binName} source.yaml old.json new.json`,
				description:
					`Patches <source.yaml> with the diff between ` +
					`<old.json> and <new.json>`
			} )
			.add( argOutput );

		const { rest, args } = op.parse( );
		const { output } = args;
		const [ yamlSourceFile, oldJsonFile, newJsonFile ] = rest;
		if ( !newJsonFile )
			bailHelp( op );

		const [ yamlSource, oldJson, newJson ] = await Promise.all( [
			promises.readFile( yamlSourceFile, 'utf-8' ),
			promises.readFile( oldJsonFile, 'utf-8' ),
			promises.readFile( newJsonFile, 'utf-8' ),
		] );

		const res = yamlDiffPatch(
			yamlSource,
			JSON.parse( oldJson ),
			JSON.parse( newJson )
		);
		await writeOut( res, output );
	}
	else if ( binName === 'yaml-overwrite' )
	{
		const op =
			oppa( {
				name: binName,
				usage: `${binName} source.yaml source.json`,
				description:
					`Patches <source.yaml> with the diff between ` +
					`<source.yaml> and <source.json>`
			} )
			.add( argOutput );

		const { rest, args } = op.parse( );
		const { output } = args;
		const [ yamlSourceFile, jsonSourceFile ] = rest;
		if ( !jsonSourceFile )
			bailHelp( op );

		const [ yamlSource, jsonSource ] = await Promise.all( [
			promises.readFile( yamlSourceFile, 'utf-8' ),
			promises.readFile( jsonSourceFile, 'utf-8' ),
		] );

		const res = yamlOverwrite( yamlSource, JSON.parse( jsonSource ) );
		await writeOut( res, output );
	}
	else
	{
		console.error( `Unknown program ${binName}` );
		process.exit( 1 );
	}
}

main( )
.catch( err =>
{
	console.error( `Failed to patch file: ` + err.message );
	process.exit( 2 );
} );
