import { promises, readdirSync } from 'fs'
import * as path from 'path'
import { parse } from 'yaml'

import { yamlPatch } from './index'


const fixtureDir = path.resolve( __dirname, '../fixtures' );
const fixtureFile = ( file: string ) => path.join( fixtureDir, file );
const fixtureFiles = readdirSync( fixtureDir );

const readFixture = async ( file: string ) =>
{
	const data =
		await promises.readFile( fixtureFile( `${file}.yaml` ), 'utf-8' );

	const chunks = data.split( "\n---\n" );

	const before = chunks[ 0 ].trim( );
	const operations =  parse( chunks[ 1 ].trim( ) ).patch;
	const after = chunks[ 2 ].trim( );

	return { before, after, operations };
}

const yamlTrim = ( yaml: string ) =>
	yaml.trim( ) + "\n";

describe( "yaml-patch", ( ) =>
{
	for ( const file of fixtureFiles )
	{
		const name = path.basename( file, path.extname( file ) );
		it( name, async ( ) =>
		{
			const { before, after, operations } = await readFixture( name );

			const result = yamlPatch( before, operations );

			expect( yamlTrim( result ) ).toEqual( yamlTrim( after ) );
		} );
	}
} );
