import { createPatch, Operation } from 'rfc6902'
import { parse, parseDocument } from 'yaml'
import { Pair, YAMLMap, YAMLSeq } from 'yaml/types'

import {
	NodeType,
	isYamlMap,
	isYamlSeq,
	toAstValue,
	cloneNode,
	parseSafeIndex,
} from './helpers'

interface ParsedPath
{
	segments: Array< string >;
	last: string;
	parent: YAMLMap | YAMLSeq;
	pathTo: ( index: number ) => string;
}

// same function as found in the rfc6902 package: https://github.com/chbrown/rfc6902/blob/master/pointer.ts
function unescape(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

function traverse( root: NodeType, op: string, path: string ): ParsedPath
{
	const segments = path.split( '/' ).slice( 1 );
	if ( segments.length === 0 )
		throw new Error( `Invalid patch path: ${path}` );

	const pathTo = ( index: number ) =>
		'/' +
		segments.slice( 0, index === -1 ? undefined : index ).join( '/' );

  const last = unescape(segments.pop( )!);

	let parent = root as YAMLMap | YAMLSeq;

	segments.forEach( ( segment, index ) =>
	{
		if ( isYamlSeq( parent ) )
			parent = parent.get( parseInt( segment ), true );
		else
			parent = parent.get( segment, true );

		if ( !isYamlMap( parent ) && !isYamlSeq( parent ) )
		{
			throw new Error(
				`Can't ${op} node at path ${path}. ` +
				`${pathTo(index)} is ${( parent as any )?.type}.`
			);
		}
	} );

	return { segments, last, parent: parent, pathTo };
}

function applySinglePatch( root: NodeType, operation: Operation )
{
	const { last, parent, pathTo } =
		traverse( root, operation.op, operation.path );

	if ( operation.op === 'add' )
	{
		if ( isYamlMap( parent ) )
		{
			// Object
			parent.delete( last );
			parent.add( new Pair( last, toAstValue( operation.value ) ) );
		}
		else
		{
			// Array
			const index = parseSafeIndex( last, parent.items.length );
			if ( index === parent.items.length )
				parent.add( toAstValue( operation.value ) );
			else if ( isNaN( index ) )
				throw RangeError(
					`Can't ${operation.op} index ${last} ` +
					`to array at ${pathTo( -1 )}`
				);
			else
				parent.items[ index ] = toAstValue( operation.value );
		}
	}
	else if ( operation.op === 'replace' )
	{
		if ( isYamlMap( parent ) )
		{
			// Object
			if ( !parent.has( last ) )
				throw new ReferenceError(
					`Can't ${operation.op} ${operation.path} ` +
					`since it doesn't already exist`
				);
			parent.set( last, toAstValue( operation.value ) );
		}
		else
		{
			// Array
			const index = parseSafeIndex( last, parent.items.length - 1 );
			if ( isNaN( index ) )
				throw RangeError(
					`Can't ${operation.op} index ${last} ` +
					`to array at ${pathTo( -1 )}`
				);
			parent.items[ index ] = toAstValue( operation.value );
		}
	}
	else if ( operation.op === 'remove' )
	{
		if ( isYamlMap( parent ) )
		{
			// Object
			parent.delete( last );
		}
		else
		{
			// Array
			const index = parseSafeIndex( last, parent.items.length - 1 );
			if ( isNaN( index ) )
				throw RangeError(
					`Can't ${operation.op} index ${last} ` +
					`to array at ${pathTo( -1 )}`
				);
			parent.items.splice( index, 1 );
		}
	}
	else if ( operation.op === 'move' || operation.op === 'copy' )
	{
		const { last: lastFrom, parent: parentFrom, pathTo: pathToFrom } =
			traverse( root, operation.op, operation.from );

		const sourceNode = ( ( ): NodeType =>
		{
			if ( isYamlMap( parentFrom ) )
			{
				// Object
				const node = parentFrom.get( lastFrom, true );
				if ( lastFrom === undefined )
					throw ReferenceError(
						`Can't ${operation.op} index ${last} to array at ` +
						pathToFrom( -1 )
					);
				if ( operation.op === 'move' )
					parentFrom.delete( lastFrom );
				return node;
			}
			else if ( isYamlSeq( parentFrom ) )
			{
				// Array
				const index =
					parseSafeIndex( lastFrom, parentFrom.items.length - 1 );
				if ( isNaN( index ) )
					throw RangeError(
						`Can't ${operation.op} index ${lastFrom} ` +
						`to array at ${pathToFrom( -1 )}`
					);

				const node = parentFrom.get( index, true );
				if ( operation.op === 'move' )
					parentFrom.delete( index );
				return node;
			}
			else
				throw new ReferenceError(
					`Invalid type at ${operation.from}`
				);
		} )( );

		const node =
			operation.op === 'move' ? sourceNode : cloneNode( sourceNode );

		if ( isYamlMap( parent ) )
		{
			// Object
			parent.delete( last );
			parent.set( last, node );
		}
		else
		{
			// Array
			const index = parseSafeIndex( last, parent.items.length );
			if ( isNaN( index ) )
				throw RangeError(
					`Can't ${operation.op} index ${last} to array at ` +
					pathTo( -1 )
				);
			else if ( index === parent.items.length )
				parent.add( node );
			else
				parent.items[ index ] = node;
		}
	}
	else if ( operation.op === 'test' )
	{
		if (
			JSON.stringify( parent.toJSON( ) ) !==
			JSON.stringify( operation.value )
		)
			throw TypeError( `Patch test failed at ${operation.path}` );
	}
	else
	{
		throw new Error(
			`Operation ${( operation as any ).op} not supported`
		);
	}
}

export function yamlPatch( yaml: string, rfc6902: Array< Operation > ): string
{
	const doc = parseDocument( yaml, {
		keepCstNodes: true,
		prettyErrors: true,
		simpleKeys: true,
	} );

	rfc6902.forEach( ( operation, index ) =>
	{
		try
		{
			applySinglePatch( doc.contents, operation );
		}
		catch ( err )
		{
			const newErr = new err.constructor(
				`Patch #${index + 1} failed: ${err.message}`
			);
			newErr.stack = err.stack;
			throw newErr;
		}
	} );

	//console.log('warn', doc.);
	return doc.toString( );
}

export function yamlDiffPatch( yaml: string, oldJson: any, newJson: any )
: string
{
	return yamlPatch( yaml, createPatch( oldJson, newJson ) );
}

export function yamlOverwrite( yaml: string, newJson: any ): string
{
	const old = parse( yaml );
	return yamlDiffPatch( yaml, old, newJson );
}
