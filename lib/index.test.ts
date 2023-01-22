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
	describe( "fixtures", ( ) =>
	{
		for ( const file of fixtureFiles )
		{
			const name = path.basename( file, path.extname( file ) );
			it( name, async ( ) =>
			{
				const { before, after, operations } =
					await readFixture( name );

				const result = yamlPatch( before, operations );

				expect( yamlTrim( result ) ).toEqual( yamlTrim( after ) );
			} );
		}
	} );

	describe( "various", ( ) =>
	{
		it( "add scalar to empty document", ( ) =>
		{
			const res = yamlPatch(
				"",
				[
					{
						op: 'add',
						path: '/a',
						value: 1,
					}
				]
			);

			expect( res ).toBe( `a: 1\n` );
		} );

		it( "add scalar (null)", ( ) =>
		{
			const res = yamlPatch(
				`a: null`,
				[
					{
						op: 'add',
						path: '/b',
						value: null,
					}
				]
			);

			expect( res ).toBe( `a: null\nb: null\n` );
		} );

		it( "add scalar (number)", ( ) =>
		{
			const res = yamlPatch(
				`a: null`,
				[
					{
						op: 'add',
						path: '/b',
						value: 42,
					}
				]
			);

			expect( res ).toBe( `a: null\nb: 42\n` );
		} );

		it( "add object", ( ) =>
		{
			const res = yamlPatch(
				`a: null`,
				[
					{
						op: 'add',
						path: '/b',
						value: { foo: 'bar' },
					}
				]
			);

			expect( res ).toBe( `a: null\nb:\n  foo: bar\n` );
		} );

		it( "add array", ( ) =>
		{
			const res = yamlPatch(
				`a: null`,
				[
					{
						op: 'add',
						path: '/b',
						value: [ 17, 42 ],
					}
				]
			);

			expect( res ).toBe( `a: null\nb:\n  - 17\n  - 42\n` );
		} );

		it( "add complex", ( ) =>
		{
			const res = yamlPatch(
				`a: null`,
				[
					{
						op: 'add',
						path: '/b',
						value: [
							{ foo: [ 17, { fourtytwo: 42 } ] },
							314,
							'foo',
						],
					}
				]
			);

			expect( res ).toMatchSnapshot( );
		} );

		it( "add string with slash in key", ( ) =>
		{
			const res = yamlPatch(
				`a: String a`,
				[
					{
						op: 'add',
						path: '/b~1b',
						value: 'String b/b',
					}
				]
			);

			expect( res ).toBe( `a: String a\nb/b: String b/b\n` );
		} );
	} );

	describe( "errors", ( ) =>
	{
		it( "reference non-existing path", ( ) =>
		{
			const thrower = ( ) => yamlPatch(
				`a: b`,
				[
					{
						op: 'add',
						path: '/foo/bar',
						value: 'baz',
					},
				],
			);

			expect( thrower ).toThrowError( /node at/ );
		} );

		it( "reference inside null", ( ) =>
		{
			const thrower = ( ) => yamlPatch(
				`foo: null`,
				[
					{
						op: 'add',
						path: '/foo/bar',
						value: 'baz',
					},
				],
			);

			expect( thrower ).toThrowError( /node at/ );
		} );

		it( "add invalid type", ( ) =>
		{
			const thrower = ( ) => yamlPatch(
				`a: null`,
				[
					{
						op: 'add',
						path: '/b',
						value: [
							42,
							( ) => { }, // This is invalid
						],
					}
				]
			);

			expect( thrower ).toThrowError( /Invalid type: function/ );
		} );

		it( "invalid array indexing (negative)", ( ) =>
		{
			const thrower = ( ) => yamlPatch(
				`a: [ 42 ]`,
				[
					{
						op: 'remove',
						path: '/a/-1',
					}
				]
			);

			expect( thrower ).toThrowError( RangeError );
			expect( thrower ).toThrowError( /Can't remove index/ );
		} );

		it( "invalid array indexing (NaN)", ( ) =>
		{
			const thrower = ( ) => yamlPatch(
				`a: [ 42 ]`,
				[
					{
						op: 'remove',
						path: '/a/foo',
					}
				]
			);

			expect( thrower ).toThrowError( /Patch #1 failed.*Can't remove/ );
		} );

		it( "invalid array indexing (out of bounds)", ( ) =>
		{
			const thrower = ( ) => yamlPatch(
				`a: [ 42 ]`,
				[
					{
						op: 'remove',
						path: '/a/1',
					}
				]
			);

			expect( thrower ).toThrowError( /Patch #1 failed.*Can't remove/ );
		} );
	} );

	describe( "keeping whitespace & structure", ( ) =>
	{
		it( "add to multi-line object keeps multi-line", ( ) =>
		{
			const result = yamlPatch(
				`a:\n  b: c\n`,
				[
					{
						op: 'add',
						path: '/a/x',
						value: 'y',
					}
				]
			);

			expect( result ).toBe( `a:\n  b: c\n  x: y\n` );
		} );

		it( "add to single-line object keeps single-line", ( ) =>
		{
			const result = yamlPatch(
				`a: { b: c }\n`,
				[
					{
						op: 'add',
						path: '/a/x',
						value: 'y',
					}
				]
			);

			expect( result ).toBe( `a: { b: c, x: y }\n` );
		} );

		it( "keep multiline and separate whitespaces w/ objects", ( ) =>
		{
			const result = yamlPatch(
				`a:\n  # foo\n\n  # bar\n  x: { b: c }\n`,
				[
					{
						op: 'add',
						path: '/a/x/y',
						value: 'z',
					}
				]
			);

			expect( result ).toBe(
				`a:\n  # foo\n\n  # bar\n  x: { b: c, y: z }\n`
			);
		} );

		it( "keep comments in objects", ( ) =>
		{
			const result = yamlPatch(
				`a:\n  # foo\n  b: c\n  # bar\n  d: e\n`,
				[
					{
						op: 'replace',
						path: '/a/d',
						value: 'f',
					}
				]
			);

			expect( result ).toBe(
				`a:\n  # foo\n  b: c\n  # bar\n  d: f\n`
			);
		} );

		it( "keep multiline and separate whitespaces w/ arrays", ( ) =>
		{
			const result = yamlPatch(
				`a:\n  # foo\n\n  # bar\n  - x: { b: c }\n`,
				[
					{
						op: 'add',
						path: '/a/0/x/y',
						value: 'z',
					}
				]
			);

			expect( result ).toBe(
				`a:\n  # foo\n\n  # bar\n  - x: { b: c, y: z }\n`
			);
		} );

		// These three don't work due to:
		// https://github.com/eemeli/yaml/issues/283
		it.skip( "keep arrays unindented when no op", ( ) =>
		{
			const result = yamlPatch(
				`a:\n- x: y\n\nb:\n  - z: y2\n`,
				[ ]
			);

			expect( result ).toBe(
				`a:\n- x: y\n\nb:\n  - z: y2\n`
			);
		} );

		it.skip( "keep arrays unindented when modified", ( ) =>
		{
			const result = yamlPatch(
				`a:\n- x: y\n\nb:\n  - z: y2\n`,
				[
					{
						op: 'add',
						path: '/a/-',
						value: { x2: 'y2' },
					}
				]
			);

			expect( result ).toBe(
				`a:\n- x: y\n- x2: y2\n\nb:\n  - z: y2\n`
			);
		} );

		it.skip( "keep arrays unindented when others modified", ( ) =>
		{
			const result = yamlPatch(
				`a:\n- x: y\n\nb:\n  - z: y2\n`,
				[
					{
						op: 'add',
						path: '/b/-',
						value: { z2: 'y3' },
					}
				]
			);

			expect( result ).toBe(
				`a:\n- x: y\n\nb:\n  - z: y2\n  - z2: y3\n`
			);
		} );

		it.skip( "keep long lines of text", ( ) =>
		{
			const line = [
				"This is a long line of txt. ", "This is a long line of txt. ",
				"This is a long line of txt. ", "This is a long line of txt. ",
				"This is markdown [Link to some long text somewhere else]",
				"(https://www.verylonglines.foo/yadayadayadayada/very/long)",
				" seems this line never ends",
			].join( '' );

			const result = yamlPatch(
				`a: ${line}\n`,
				[ ]
			);

			expect( result ).toBe( `a: ${line}\n` );
		} );

		it.skip( "keep long lines of array content", ( ) =>
		{
			const line = [
				"This is an array element.", "This is an array element.",
				"This is an array element.", "This is an array element.",
				"This is an array element.", "This is an array element.",
				"This is an array element.", "This is an array element.",
			]
			.map( elem => `"${elem}"` )
			.join( ', ' );

			const result = yamlPatch(
				`a: [ ${line} ]\n`,
				[ ]
			);

			expect( result ).toBe( `a: [ ${line} ]\n` );
		} );
	} );

	describe( "options", ( ) =>
	{
		it.skip( "keep long lines of text if lineWidth is set to 0", ( ) =>
		{
			const line = [
				"This is a long line of txt. ", "This is a long line of txt. ",
				"This is a long line of txt. ", "This is a long line of txt. ",
				"This is markdown [Link to some long text somewhere else]",
				"(https://www.verylonglines.foo/yadayadayadayada/very/long)",
				" seems this line never ends",
			].join( '' );

			const result = yamlPatch(
				`a: ${line}\n`,
				[ ],
				{ lineWidth: 0 }
			);

			expect( result ).toBe( `a: ${line}\n` );
		} );
	} );
} );
